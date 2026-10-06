import { EARNINGS_HOLD_MS } from "../earnings/order-earnings.service.js";

export function servicePaymentStatus(proposal, conversationStatus, { now = new Date(), isSeller = false, requiresDeliveryConfirmation = false } = {}) {
  const payment = proposal?.cobranca?.pagamento;
  if (!payment) return null;
  if (!["PAGO", "LIQUIDADO", "ESTORNADO"].includes(payment.status)) return null;
  const transaction = payment.transacao_comercial;
  const payout = transaction?.repasse_pix;
  const availableAt = transaction?.validada_em
    ? new Date(new Date(transaction.validada_em).getTime() + EARNINGS_HOLD_MS)
    : null;
  const refunded = payment.status === "ESTORNADO";
  const disputed = conversationStatus === "EM_DISPUTA";
  const released = transaction?.status === "LIQUIDADA";
  const state = refunded ? "REFUNDED" : disputed ? "DISPUTED"
    : released ? "RELEASED" : transaction?.status === "VALIDADA" ? "PENDING_RELEASE" : "AWAITING_SERVICE";
  return {
    state,
    requiresDeliveryConfirmation,
    grossCents: Number(proposal.valor_centavos),
    availableAt: availableAt?.toISOString() ?? null,
    automaticRelease: state === "PENDING_RELEASE",
    canDispute: !refunded && !disputed && !released
      && proposal.status === "CONCLUIDA" && availableAt && now < availableAt
      && transaction?.status === "VALIDADA" ? true : false,
    ...(isSeller ? {
      netCents: transaction?.valor_liquido_lojista_centavos != null ? Number(transaction.valor_liquido_lojista_centavos) : null,
      feeCents: transaction?.taxa_plataforma_centavos != null ? Number(transaction.taxa_plataforma_centavos) : null,
      destination: proposal.forma_pagamento === "QR_PRESENCIAL" ? "PIX" : "SALES_WALLET",
      payoutStatus: payout?.status ?? null,
    } : {}),
  };
}
