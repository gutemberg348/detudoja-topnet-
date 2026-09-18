import { env } from "../../config/env.js";
import { emitServiceChatUpdated } from "../../realtime/socket.server.js";
import { refundUnattendedServicePayment } from "../admin/admin-payments.service.js";
import {
  createServiceTimeoutRepository,
  serviceTimeoutRepository,
} from "./service-timeout.repository.js";

const unattendedReason = "Prestador nao confirmou a execucao do servico dentro do prazo operacional.";
const idleReason = `Atendimento encerrado automaticamente apos ${env.services.idleTimeoutMinutes} minutos sem interacao ou proposta.`;

function emitServiceTimeoutConversation(conversation, reason) {
  emitServiceChatUpdated({
    conversationId: conversation.id,
    customerUserId: conversation.cliente_usuario_id,
    reason,
    sellerUserId: conversation.vendedor.usuario_id,
  });
}

async function moveExpiredConfirmationToDispute(conversation, cutoff) {
  return serviceTimeoutRepository.transaction(async (database) => {
    const repository = createServiceTimeoutRepository(database);
    const claimed = await repository.updateConversations({
      data: { status: "EM_DISPUTA" },
      where: {
        atualizado_em: { lte: cutoff },
        id: conversation.id,
        status: "AGUARDANDO_CONFIRMACAO",
      },
    });
    if (claimed.count !== 1) return false;

    await repository.createMessage({
      data: {
        conversa_servico_id: conversation.id,
        lido_cliente_em: new Date(),
        lido_vendedor_em: new Date(),
        mensagem: "O prazo de confirmacao terminou. O valor segue sob custodia e o atendimento foi enviado para revisao do suporte.",
        origem: "SISTEMA",
      },
    });
    return true;
  });
}

async function cancelIdleConversation(conversation, cutoff, now) {
  return serviceTimeoutRepository.transaction(async (database) => {
    const repository = createServiceTimeoutRepository(database);
    const claimed = await repository.updateConversations({
      data: { encerrado_em: now, status: "CANCELADA" },
      where: {
        atualizado_em: { lte: cutoff },
        id: conversation.id,
        propostas: {
          none: {
            status: { in: ["PENDENTE", "ACEITA", "PAGA", "CONCLUIDA"] },
          },
        },
        status: { in: ["ABERTA", "ACORDADA"] },
      },
    });
    if (claimed.count !== 1) return false;

    await repository.updateCourierRequests({
      data: { cancelado_em: now, status: "CANCELADA" },
      where: { conversa_servico_id: conversation.id, status: "ACEITA" },
    });
    await repository.createMessage({
      data: {
        conversa_servico_id: conversation.id,
        lido_cliente_em: now,
        lido_vendedor_em: now,
        mensagem: idleReason,
        origem: "SISTEMA",
      },
    });
    return true;
  });
}

export async function expireUnattendedServices({ now = new Date() } = {}) {
  const courierCutoff = new Date(
    now.getTime() - (env.courier.requestTimeoutMinutes * 60 * 1_000),
  );
  const idleCutoff = new Date(
    now.getTime() - (env.services.idleTimeoutMinutes * 60 * 1_000),
  );
  const unattendedCutoff = new Date(
    now.getTime() - (env.services.unattendedTimeoutMinutes * 60 * 1_000),
  );
  const confirmationCutoff = new Date(
    now.getTime() - (env.services.confirmationTimeoutMinutes * 60 * 1_000),
  );
  const [idleConversations, payments, confirmations] = await Promise.all([
    serviceTimeoutRepository.findIdleServiceConversations(idleCutoff),
    serviceTimeoutRepository.findUnattendedServicePayments(unattendedCutoff),
    serviceTimeoutRepository.findConversationsAwaitingConfirmation(confirmationCutoff),
  ]);
  const failed = [];
  let refunded = 0;
  let disputed = 0;
  let cancelledIdle = 0;
  const expiredCourierRequests = await serviceTimeoutRepository.updateCourierRequests({
    data: { status: "EXPIRADA" },
    where: {
      OR: [
        { criado_em: { lte: courierCutoff } },
        { expira_em: { lte: now } },
      ],
      status: "PENDENTE",
    },
  });

  for (const conversation of idleConversations) {
    try {
      if (await cancelIdleConversation(conversation, idleCutoff, now)) {
        cancelledIdle += 1;
        emitServiceTimeoutConversation(conversation, "service-idle-timeout");
      }
    } catch (error) {
      failed.push({ conversationId: conversation.id, error, type: "idle-cancel" });
    }
  }

  for (const payment of payments) {
    try {
      const result = await refundUnattendedServicePayment(payment.id, { reason: unattendedReason });
      if (result.processed) refunded += 1;
    } catch (error) {
      failed.push({ error, paymentId: payment.id, type: "refund" });
    }
  }

  for (const conversation of confirmations) {
    try {
      if (await moveExpiredConfirmationToDispute(conversation, confirmationCutoff)) {
        disputed += 1;
        emitServiceTimeoutConversation(conversation, "service-confirmation-timeout");
      }
    } catch (error) {
      failed.push({ conversationId: conversation.id, error, type: "dispute" });
    }
  }

  return {
    cancelledIdle,
    disputed,
    expiredCourierRequests: expiredCourierRequests.count,
    failed,
    refunded,
    scannedConfirmations: confirmations.length,
    scannedIdle: idleConversations.length,
    scannedPayments: payments.length,
  };
}
