import { AppError } from "../../utils/errors.js";

export const SANDBOX_AUDIT_ACTION = "PAGAMENTO_SANDBOX_SIMULADO";

export function sandboxOnlyConfiguration(source = process.env) {
  if (source.PAYMENTS_ENVIRONMENT !== "sandbox") return false;
  if (![undefined, "", "sandbox"].includes(source.SICREDI_MULTIPAG_ENV)
    || ![undefined, "", "sandbox"].includes(source.SICREDI_PIX_ENV)) return false;
  try {
    if (source.ASAAS_ENABLED === "true"
      && new URL(source.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3").hostname !== "api-sandbox.asaas.com") return false;
    for (const name of ["SICREDI_PIX_API_URL", "SICREDI_PIX_AUTH_URL"]) {
      if (source[name] && new URL(source[name]).hostname === "api-pix.sicredi.com.br") return false;
    }
    for (const name of ["SICREDI_MULTIPAG_API_URL", "SICREDI_MULTIPAG_AUTH_URL"]) {
      if (source[name] && !new URL(source[name]).pathname.startsWith("/sb/")) return false;
    }
  } catch { return false; }
  return true;
}

export function sandboxApprovalEnabled(source = process.env) {
  return source.PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED === "true" && sandboxOnlyConfiguration(source);
}

export function assertSandboxApproval(payment, action = "PAYMENT_RECEIVED", source = process.env) {
  if (!sandboxApprovalEnabled(source)) throw new AppError("Aprovacao manual disponivel somente no Sandbox habilitado", 403);
  if (!payment || !["ASAAS", "SICREDI"].includes(payment.gateway)
    || payment.gateway_ambiente !== "sandbox") throw new AppError("Pagamento nao pertence ao Sandbox", 409);
  if (action === "PAYMENT_RECEIVED") {
    if (!["AGUARDANDO_PAGAMENTO", "EM_RECONCILIACAO"].includes(payment.status)
      || Number(payment.valor_pago_pix_centavos) <= 0) throw new AppError("Pagamento nao aguarda confirmacao Pix", 409);
  } else if (action === "PAYMENT_REFUNDED") {
    if (payment.status !== "EM_DISPUTA" || !payment.gateway_dados_json?.sandboxManualApproval) {
      throw new AppError("Solicite primeiro o estorno de um pagamento aprovado manualmente no Sandbox", 409);
    }
  } else throw new AppError("Acao de teste invalida", 400);
}

// Called before workers/listening, even if the manual-approval flag was removed.
// Test balances can be spent through the normal ledger; they cannot fund prod.
export async function assertSandboxLedgerIsolation(database, source = process.env) {
  const hasSimulation = await database.auditoriaAdministrativa.findFirst({
    where: { acao: SANDBOX_AUDIT_ACTION }, select: { id: true },
  });
  if ((hasSimulation || source.PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED === "true") && !sandboxOnlyConfiguration(source)) {
    throw new Error("Banco com simulacoes Sandbox nao pode operar em producao. Use um banco limpo apos o encerramento dos testes.");
  }
}

export async function recordSandboxApproval(database, paymentId, approval, event) {
  if (!paymentId) throw new AppError("Pagamento nao encontrado", 404);
  await database.$queryRaw`SELECT id FROM pagamentos WHERE id = ${paymentId} FOR UPDATE`;
  const payment = await database.pagamento.findUnique({ where: { id: paymentId } });
  assertSandboxApproval(payment, event);
  const metadata = { adminId: approval.adminId, reason: approval.reason, at: new Date().toISOString() };
  await database.pagamento.update({
    where: { id: paymentId },
    data: { gateway_dados_json: {
      ...(payment.gateway_dados_json ?? {}),
      [event === "PAYMENT_RECEIVED" ? "sandboxManualApproval" : "sandboxManualRefund"]: metadata,
    } },
  });
  await database.auditoriaAdministrativa.create({ data: {
    administrador_id: approval.adminId,
    usuario_alvo_id: payment.usuario_pagador_id,
    acao: SANDBOX_AUDIT_ACTION,
    dados_json: { ...metadata, paymentId, event, gateway: payment.gateway,
      pixCents: String(payment.valor_pago_pix_centavos), simulated: true },
  } });
}
