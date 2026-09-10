import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { refundUnattendedOrderPayment } from "../admin/admin-payments.service.js";
import { refreshAsaasRefundPayment } from "../payments/asaas.service.js";
import { orderTimeoutRepository } from "./order-timeout.repository.js";
import { releaseReservedOrderStock } from "./order-stock.service.js";

const automaticRefundReason = "Loja nao iniciou o atendimento dentro do prazo operacional.";

export async function expireUnattendedStoreOrders({ now = new Date() } = {}) {
  const cutoff = new Date(
    now.getTime() - (env.orders.unattendedTimeoutMinutes * 60 * 1_000),
  );
  const candidates = await orderTimeoutRepository.findUnattendedPaidOrders(cutoff);
  const failed = [];
  let canceled = 0;
  let skipped = 0;

  for (const order of candidates) {
    try {
      const result = await refundUnattendedOrderPayment(order.pagamento_id, {
        reason: automaticRefundReason,
      });
      if (result.processed) {
        canceled += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failed.push({ error, paymentId: order.pagamento_id });
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
    canceled,
    failed,
    refreshedAsaasRefunds,
    scanned: candidates.length,
    skipped,
  };
}
