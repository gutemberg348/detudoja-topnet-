import { env } from "../../config/env.js";
import { emitServiceChatUpdated } from "../../realtime/socket.server.js";
import { refundUnattendedServicePayment } from "../admin/admin-payments.service.js";
import {
  createServiceTimeoutRepository,
  serviceTimeoutRepository,
} from "./service-timeout.repository.js";

const unattendedReason = "Prestador nao confirmou a execucao do servico dentro do prazo operacional.";

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

export async function expireUnattendedServices({ now = new Date() } = {}) {
  const unattendedCutoff = new Date(
    now.getTime() - (env.services.unattendedTimeoutMinutes * 60 * 1_000),
  );
  const confirmationCutoff = new Date(
    now.getTime() - (env.services.confirmationTimeoutMinutes * 60 * 1_000),
  );
  const [payments, confirmations] = await Promise.all([
    serviceTimeoutRepository.findUnattendedServicePayments(unattendedCutoff),
    serviceTimeoutRepository.findConversationsAwaitingConfirmation(confirmationCutoff),
  ]);
  const failed = [];
  let refunded = 0;
  let disputed = 0;

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
    disputed,
    failed,
    refunded,
    scannedConfirmations: confirmations.length,
    scannedPayments: payments.length,
  };
}
