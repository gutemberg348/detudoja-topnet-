import { AppError } from "../../utils/errors.js";

export function isServiceCompletedOutsideApp(proposal) {
  return Boolean(proposal?.status === "CONCLUIDA" && proposal.concluido_em
    && !proposal.pago_em && proposal.cobranca?.status === "CANCELADA"
    && !proposal.cobranca.pagamento_id && !proposal.cobranca.pagamento && !proposal.cobranca.paga_em);
}

export function hasServicePlatformPayment(proposal) {
  return Boolean(["PAGA", "CONCLUIDA"].includes(proposal.status)
    || proposal.pago_em || proposal.cobranca?.pagamento_id || proposal.cobranca?.pagamento
    || proposal.cobranca?.paga_em || ["PAGA", "PROCESSANDO"].includes(proposal.cobranca?.status));
}

const closureInclude = {
  vendedor: { select: { usuario_id: true } },
  propostas: { include: { cobranca: true } },
  servico_vendedor: { select: { tipo_servico: { select: { tipo_operacao: true } } } },
};

// Serialize creation/acceptance and closure so cancellation cannot miss a
// charge being created by an uncommitted acceptance. This is a separate lock
// from courier completion; payment continues to claim the charge first.
export function lockServiceProposalChanges(database, conversationId) {
  const key = 725_020_000_000 + Number(conversationId);
  return database.$queryRaw`SELECT pg_advisory_xact_lock(CAST(${key} AS bigint))::text AS locked`;
}

async function accessibleConversation(database, userId, conversationId) {
  const conversation = await database.conversaServico.findFirst({
    include: closureInclude,
    where: { id: conversationId, OR: [{ cliente_usuario_id: userId }, { vendedor: { usuario_id: userId } }] },
  });
  if (!conversation) throw new AppError("Conversa nao encontrada", 404);
  return conversation;
}

// Claim charges before proposals/conversation, as the payment flow does. The
// conditional write shares the same row lock as paying: exactly one can win.
async function cancelCharge(database, charge, when) {
  const claimed = await database.cobranca.updateMany({
    data: { cancelada_em: when, status: "CANCELADA" },
    where: { id: charge.id, pagamento_id: null, paga_em: null, status: { in: ["ATIVA", "EXPIRADA"] } },
  });
  if (claimed.count !== 1) throw new AppError("A cobranca mudou. Atualize o atendimento antes de continuar", 409);
}

export async function completeServiceOutsideAppInTransaction(database, userId, conversationId, proposalId) {
  await lockServiceProposalChanges(database, conversationId);
  const conversation = await accessibleConversation(database, userId, conversationId);
  if (conversation.vendedor.usuario_id !== userId) {
    throw new AppError("Somente o prestador pode registrar o recebimento fora do app", 403);
  }
  if (conversation.loja_solicitante_id || conversation.pedido_loja_id) {
    throw new AppError("Entregas de pedidos precisam seguir a confirmacao do pedido", 409);
  }
  const proposal = conversation.propostas.find((item) => item.id === proposalId);
  if (!proposal) throw new AppError("Proposta nao encontrada neste atendimento", 404);
  if (conversation.status === "ENCERRADA" && isServiceCompletedOutsideApp(proposal)) {
    return { changed: false, chargeId: proposal.cobranca.id };
  }
  const courier = conversation.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL";
  const allowedStatuses = courier ? ["ACORDADA", "AGUARDANDO_CONFIRMACAO"] : ["ACORDADA"];
  if (!allowedStatuses.includes(conversation.status) || proposal.status !== "ACEITA"
    || proposal.forma_pagamento !== "QR_PRESENCIAL" || !proposal.cobranca
    || conversation.propostas.some(hasServicePlatformPayment)) {
    throw new AppError("Este atendimento nao permite registrar pagamento fora do app", 409);
  }
  const now = new Date();
  await cancelCharge(database, proposal.cobranca, now);
  const completed = await database.propostaServico.updateMany({
    data: { concluido_em: now, status: "CONCLUIDA" },
    where: { id: proposal.id, conversa_servico_id: conversation.id, status: "ACEITA", pago_em: null },
  });
  if (completed.count !== 1) throw new AppError("A proposta mudou antes da conclusao", 409);
  const closed = await database.conversaServico.updateMany({
    data: { encerrado_em: now, status: "ENCERRADA" },
    where: { id: conversation.id, status: { in: allowedStatuses } },
  });
  if (closed.count !== 1) throw new AppError("O atendimento mudou antes da conclusao", 409);
  await database.solicitacaoMotoboy.updateMany({
    data: { status: "CONCLUIDA" }, where: { conversa_servico_id: conversation.id, status: "ACEITA" },
  });
  await database.conversaServicoMensagem.create({ data: {
    autor_usuario_id: userId, conversa_servico_id: conversation.id, lido_vendedor_em: now,
    mensagem: "Servico concluido. O prestador informou que recebeu fora do app. A cobranca do app foi cancelada; nao ha movimentacao de carteira, pool, cashback ou ganhos da rede.",
    origem: "SISTEMA",
  } });
  return { changed: true, chargeId: proposal.cobranca.id };
}

export async function cancelUnpaidServiceInTransaction(database, userId, conversationId) {
  await lockServiceProposalChanges(database, conversationId);
  const conversation = await accessibleConversation(database, userId, conversationId);
  if (conversation.status === "CANCELADA") return { changed: false };
  if (!["ABERTA", "ACORDADA"].includes(conversation.status)) {
    throw new AppError("Este atendimento nao pode mais ser cancelado", 409);
  }
  if (conversation.propostas.some(hasServicePlatformPayment)) {
    throw new AppError("O atendimento possui pagamento confirmado ou em andamento e nao pode ser cancelado", 409);
  }
  const now = new Date();
  const charges = conversation.propostas.map((proposal) => proposal.cobranca)
    .filter((charge) => charge && ["ATIVA", "EXPIRADA"].includes(charge.status))
    .sort((a, b) => a.id - b.id);
  for (const charge of charges) await cancelCharge(database, charge, now);
  await database.propostaServico.updateMany({
    data: { status: "CANCELADA" },
    where: { conversa_servico_id: conversation.id, status: { in: ["PENDENTE", "ACEITA"] } },
  });
  const closed = await database.conversaServico.updateMany({
    data: { encerrado_em: now, status: "CANCELADA" },
    where: { id: conversation.id, status: { in: ["ABERTA", "ACORDADA"] } },
  });
  if (closed.count !== 1) throw new AppError("O atendimento mudou antes do cancelamento", 409);
  await database.solicitacaoMotoboy.updateMany({
    data: { cancelado_em: now, status: "CANCELADA" },
    where: { conversa_servico_id: conversation.id, status: "ACEITA" },
  });
  const isSeller = conversation.vendedor.usuario_id === userId;
  const courier = conversation.loja_solicitante_id || conversation.servico_vendedor?.tipo_servico?.tipo_operacao === "ENTREGA_LOCAL";
  await database.conversaServicoMensagem.create({ data: {
    autor_usuario_id: userId, conversa_servico_id: conversation.id,
    ...(isSeller ? { lido_vendedor_em: now } : { lido_cliente_em: now }),
    mensagem: courier ? `Corrida cancelada ${isSeller ? "pelo motoboy" : "pelo solicitante"}.`
      : `Chamado cancelado ${isSeller ? "pelo prestador" : "pelo cliente"}.`, origem: "SISTEMA",
  } });
  return { changed: true, chargeIds: charges.map((charge) => charge.id) };
}
