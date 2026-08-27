import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

function ensureAsaasConfiguration() {
  if (!env.asaas.enabled) {
    throw new AppError("Gateway Asaas nao esta habilitado", 503);
  }

  if (!env.asaas.apiKey) {
    throw new AppError("ASAAS_API_KEY nao foi configurada", 503);
  }
}

async function asaasRequest(path, options = {}) {
  ensureAsaasConfiguration();

  let response;

  try {
    response = await fetch(`${env.asaas.apiUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/json",
        access_token: env.asaas.apiKey,
        "content-type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new AppError("Nao foi possivel conectar ao gateway Asaas", 502);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.errors?.[0]?.description
      ?? payload?.message
      ?? "O Asaas recusou a solicitacao de pagamento";
    throw new AppError(message, 502);
  }

  return payload;
}

export function isAsaasEnabled() {
  return env.asaas.enabled && Boolean(env.asaas.apiKey);
}

export function createAsaasCustomer(data) {
  return asaasRequest("/customers", {
    body: JSON.stringify(data),
    method: "POST",
  });
}

export function createAsaasPixPayment(data) {
  return asaasRequest("/payments", {
    body: JSON.stringify(data),
    method: "POST",
  });
}

export function getAsaasPixQrCode(paymentId) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
}

export function getAsaasPaymentStatus(paymentId) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}/status`);
}

export function refundAsaasPayment(paymentId, data = {}) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    body: JSON.stringify(data),
    method: "POST",
  });
}

export function deleteAsaasPayment(paymentId) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}`, {
    method: "DELETE",
  });
}
