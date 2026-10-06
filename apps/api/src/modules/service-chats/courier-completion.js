import { completePaidService } from "./paid-service-completion.js";

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

export function completePaidCourierRide(database, options) {
  return completePaidService(database, { ...options, service: false });
}
