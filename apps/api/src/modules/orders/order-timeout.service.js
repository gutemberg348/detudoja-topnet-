import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { emitOrderMessageCreated } from "../../realtime/socket.server.js";
import { sendExpoPushToUsers } from "../notifications/notifications.service.js";
import { refreshAsaasRefundPayment } from "../payments/asaas.service.js";
import { orderTimeoutRepository } from "./order-timeout.repository.js";
import { releaseReservedOrderStock } from "./order-stock.service.js";
import { serializeOrderMessage } from "./orders.serializer.js";

const cancellationPromptKind = "customer-cancel-choice";

export async function expireUnattendedStoreOrders({ now = new Date() } = {}) {
  const cutoff = new Date(
    now.getTime() - (env.orders.unattendedTimeoutMinutes * 60 * 1_000),
  );
  const candidates = await orderTimeoutRepository.findUnattendedPaidOrders(cutoff);
  const failed = [];
  let prompted = 0;
  let skipped = 0;

  for (const order of candidates) {
    try {
      const message = await prisma.$transaction(async (database) => {
        await database.$queryRaw`SELECT pg_advisory_xact_lock(71429, ${order.id}::int)::text AS lock_result`;
        const current = await database.pedidoLoja.findFirst({
          select: { aceito_em: true, id: true, status: true },
          where: {
            aceito_em: null,
            id: order.id,
            pagamento: {
              is: {
                pago_em: { lte: cutoff },
                status: { in: ["PAGO", "LIQUIDADO"] },
              },
            },
            status: "RECEBIDO",
          },
        });
        if (!current) return null;

        const existing = await database.pedidoLojaMensagem.findFirst({
          select: { id: true },
          where: {
            metadata_json: { path: ["kind"], equals: cancellationPromptKind },
            pedido_id: order.id,
          },
        });
        if (existing) return null;

        return database.pedidoLojaMensagem.create({
          data: {
            mensagem: "A loja ainda nao aceitou seu pedido. Voce pode continuar esperando ou cancelar agora e escolher entre estorno na origem e credito no Saldo Pix.",
            metadata_json: {
              kind: cancellationPromptKind,
              options: ["WAIT", "ORIGINAL", "BALANCE"],
            },
            origem: "SISTEMA",
            pedido_id: order.id,
            titulo: "Deseja continuar esperando?",
          },
          include: { autor: { select: { id: true, nome: true } } },
        });
      });

      if (!message) {
        skipped += 1;
        continue;
      }

      const serializedMessage = serializeOrderMessage(message);
      emitOrderMessageCreated({
        customerId: order.usuario_id,
        message: serializedMessage,
        orderId: order.id,
        storeId: order.loja_id,
      });
      void sendExpoPushToUsers({
        body: "A loja ainda nao aceitou. Continue esperando ou escolha como deseja receber o valor de volta.",
        channelId: "orders",
        data: {
          openOrderId: order.id,
          orderId: order.id,
          reason: cancellationPromptKind,
          screen: "StoreConversation",
          storeId: order.loja_id,
        },
        title: "Decida sobre seu pedido",
        userIds: [order.usuario_id],
      }).catch(() => {});
      prompted += 1;
    } catch (error) {
      failed.push({ error, orderId: order.id, paymentId: order.pagamento_id });
    }
  }

  const pendingAsaasRefunds = await orderTimeoutRepository.findAsaasRefundsAwaitingConfirmation();
  let refreshedAsaasRefunds = 0;

  for (const payment of pendingAsaasRefunds) {
    try {
      await prisma.$transaction((database) =>
        releaseReservedOrderStock(database, payment.pedido_loja.id),
      );
      await refreshAsaasRefundPayment(payment.id);
      refreshedAsaasRefunds += 1;
    } catch (error) {
      failed.push({ error, paymentId: payment.id });
    }
  }

  return {
    canceled: 0,
    failed,
    prompted,
    refreshedAsaasRefunds,
    scanned: candidates.length,
    skipped,
  };
}
