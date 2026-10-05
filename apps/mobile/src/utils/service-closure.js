export function serviceQrActions(charge) {
  const unpaid = Boolean(charge?.serviceConversationId && charge.serviceProposalId
    && charge.serviceProposalStatus === "ACEITA" && !charge.payment && !charge.paidAt
    && ["ATIVA", "EXPIRADA"].includes(charge.status));
  return {
    canCompleteOutsideApp: unpaid && !charge.serviceLinkedOrder
      && charge.servicePaymentMode === "QR_PRESENCIAL"
      && ["ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(charge.serviceConversationStatus),
    canCancel: unpaid && charge.serviceConversationStatus === "ACORDADA",
    completedOutsideApp: Boolean(charge?.serviceCompletedOutsideApp),
  };
}

export function serviceProposalHasPlatformPayment(proposal) {
  return Boolean(proposal && !proposal.completedOutsideApp && (
    ["PAGA", "CONCLUIDA"].includes(proposal.status) || proposal.paidAt
    || ["PAGA", "PROCESSANDO"].includes(proposal.charge?.status) || proposal.charge?.paymentStatus
  ));
}

export function canCancelServiceConversation(conversation) {
  return ["ABERTA", "ACORDADA"].includes(conversation?.status)
    && !(conversation?.proposals ?? []).some((proposal) => (
      proposal.completedOutsideApp || serviceProposalHasPlatformPayment(proposal)
    ));
}
