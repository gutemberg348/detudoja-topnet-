import { AppError } from "../../../utils/errors.js";

export function sicrediCents(value) {
  const text = String(value ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, decimal = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
function mismatch() {
  const error = new AppError("Resposta Sicredi nao corresponde a operacao; conciliacao necessaria", 409);
  error.providerStateUnknown = true;
  throw error;
}
export function validateSicrediCharge(payment, charge, key) {
  if (charge?.txid !== payment.gateway_pagamento_id || charge?.chave !== key
    || sicrediCents(charge?.valor?.original) !== Number(payment.valor_pago_pix_centavos)) mismatch();
}
export function validateSicrediReceipt(payment, receipt, e2eId) {
  if (receipt?.txid !== payment.gateway_pagamento_id || receipt?.endToEndId !== e2eId
    || (payment.gateway_dados_json?.e2eId && payment.gateway_dados_json.e2eId !== e2eId)
    || !/^[a-zA-Z0-9]{32}$/.test(e2eId ?? "")
    || sicrediCents(receipt?.valor) !== Number(payment.valor_pago_pix_centavos)) mismatch();
}
export function validateSicrediRefund(payment, refund) {
  if (refund?.id !== payment.gateway_dados_json?.refundId
    || sicrediCents(refund?.valor) !== Number(payment.valor_pago_pix_centavos)) mismatch();
}
export function normalizeSicrediTransfer(record, response) {
  const amount = record.valor_liquido_centavos ?? record.valor_centavos;
  if (response?.idTransacao !== record.referencia_externa
    || sicrediCents(response?.valorPagamento) !== Number(amount)
    || (response.documentoBeneficiario && response.documentoBeneficiario.replace(/\D/g, "") !== record.documento_titular.replace(/\D/g, ""))) mismatch();
  return {
    id: record.referencia_externa,
    externalReference: record.referencia_externa,
    // Only documented FINAL bank states release a reservation.
    status: ({ SUCESSO: "DONE", CANCELADO: "CANCELLED", ERRO: "FAILED",
      NAO_APROVADO: "FAILED", EXPIRADO: "FAILED" })[response.status] ?? "PENDING",
    failReason: ["ERRO", "NAO_APROVADO", "EXPIRADO", "CANCELADO"].includes(response.status)
      ? `Sicredi confirmou ${response.status}` : null,
    value: Number(amount) / 100,
  };
}
