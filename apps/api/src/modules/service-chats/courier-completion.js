import { AppError } from "../../utils/errors.js";
import { settlePaidAutonomousChargeEarnings } from "../earnings/order-earnings.service.js";
import { createServiceChatsRepository } from "./service-chats.repository.js";

export function isCourierConversation(conversation) {
  return Boolean(
    !conversation?.loja_solicitante_id
    && !conversation?.pedido_loja_id
    && (
      conversation?.solicitacao_motoboy?.id
      || conversation?.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL"
    ),
  );
}

export function shouldCompletePaidCourierRide(conversation, paymentMode) {
  return isCourierConversation(conversation)
    && paymentMode === "QR_PRESENCIAL"
    && conversation.status === "AGUARDANDO_CONFIRMACAO";
}

export function lockCourierConversation(database, conversationId) {
  const lockKey = 724_020_000_000 + Number(conversationId);
  return database.$queryRaw`SELECT pg_advisory_xact_lock(CAST(${lockKey} AS bigint))::text AS locked`;
}

// Both signals are required: the rider finishes the ride and the charge is paid.
// Whichever arrives last completes the ride and creates pending earnings once.
export async function completePaidCourierRide(database, {
  actorUserId,
  chargeId,
  conversationId,
  expectedStatus,
  proposalId,
  when = new Date(),
}) {
  const repository = createServiceChatsRepository(database);
  const completed = await repository.updateConversations({
    data: { encerrado_em: when, status: "ENCERRADA" },
    where: { id: conversationId, status: expectedStatus },
  });
  if (completed.count !== 1) throw new AppError("A corrida mudou antes da conclusao", 409);

  const proposal = await repository.updateProposals({
    data: { concluido_em: when, status: "CONCLUIDA" },
    where: { id: proposalId, conversa_servico_id: conversationId, status: "PAGA" },
  });
  if (proposal.count !== 1) throw new AppError("O pagamento mudou antes da conclusao", 409);

  await repository.updateCourierRequests({
    data: { status: "CONCLUIDA" },
    where: { conversa_servico_id: conversationId, status: "ACEITA" },
  });
  await repository.createMessage({
    data: {
      autor_usuario_id: actorUserId,
      conversa_servico_id: conversationId,
      lido_cliente_em: actorUserId ? null : when,
      lido_vendedor_em: actorUserId ? when : null,
      mensagem: "Corrida finalizada e pagamento confirmado. Os ganhos ficam protegidos por 24 horas; o cliente pode contestar nesse periodo.",
      origem: "SISTEMA",
    },
  });
  return settlePaidAutonomousChargeEarnings(database, chargeId);
}
