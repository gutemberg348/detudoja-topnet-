import { completePaidService } from "./paid-service-completion.js";
import { createServiceChatsRepository } from "./service-chats.repository.js";
import { isCourierConversation } from "./courier-completion.js";

// Old releases left paid services waiting for a customer click. Give those
// already reported as delivered a fresh, visible dispute window on upgrade.
export async function completeLegacyDeliveredService(database, conversationId, now = new Date()) {
  const conversation = await database.conversaServico.findFirst({
    where: { id: conversationId, status: "AGUARDANDO_CONFIRMACAO", loja_solicitante_id: null, pedido_loja_id: null },
    include: {
      propostas: { include: { cobranca: { include: { pagamento: true } } }, orderBy: { criado_em: "desc" } },
      vendedor: { select: { usuario_id: true } },
      servico_vendedor: { include: { tipo_servico: true } },
      solicitacao_motoboy: true,
    },
  });
  if (!conversation) return null;
  const proposal = conversation.propostas.find((item) => item.status === "PAGA"
    && item.cobranca?.status === "PAGA" && ["PAGO", "LIQUIDADO"].includes(item.cobranca?.pagamento?.status));
  if (!proposal) return null;
  const repository = createServiceChatsRepository(database);
  const transaction = await repository.findCommercialTransaction({ where: { pagamento_id: proposal.cobranca.pagamento.id } });
  if (transaction) {
    await repository.lockCommercialTransaction(transaction.id);
    const current = await repository.findCommercialTransaction({ where: { id: transaction.id } });
    if (!["PENDENTE", "VALIDADA"].includes(current?.status)) return null;
  }
  const earnings = await completePaidService(database, {
    actorUserId: null,
    chargeId: proposal.cobranca.id,
    conversationId,
    expectedStatus: "AGUARDANDO_CONFIRMACAO",
    proposalId: proposal.id,
    when: now,
    service: !isCourierConversation(conversation),
  });
  // Existing pending distributions must also get the announced fresh window.
  await database.transacaoComercial.updateMany({
    where: { id: earnings.transactionId, status: "VALIDADA" },
    data: { validada_em: now },
  });
  await database.recebivel.updateMany({
    where: { transacao_comercial_id: earnings.transactionId, status: "PENDENTE" },
    data: { disponivel_em: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  });
  return { conversation, earnings };
}
