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
    const error = new AppError("Nao foi possivel conectar ao gateway Asaas", 502);
    error.providerStateUnknown = true;
    throw error;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.errors?.[0]?.description
      ?? payload?.message
      ?? "O Asaas recusou a solicitacao de pagamento";
    const error = new AppError(message, 502);
    error.providerRejected = true;
    error.providerStatusCode = response.status;
    throw error;
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

export function createAsaasPixTransfer(data) {
  return asaasRequest("/transfers", {
    body: JSON.stringify(data),
    method: "POST",
  });
}

export function getAsaasTransfer(transferId) {
  return asaasRequest(`/transfers/${encodeURIComponent(transferId)}`);
}

export function getAsaasExternalPixKey({ key, type }) {
  const query = new URLSearchParams({ key, type });
  return asaasRequest(`/pix/addressKeys/external?${query.toString()}`);
}

export function listAsaasTransfers(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return asaasRequest(`/transfers${query.size ? `?${query.toString()}` : ""}`);
}

export function getAsaasPixQrCode(paymentId) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
}

export function getAsaasPaymentStatus(paymentId) {
  return asaasRequest(`/payments/${encodeURIComponent(paymentId)}/status`);
}

export function listAsaasPayments(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return asaasRequest(`/payments${query.size ? `?${query.toString()}` : ""}`);
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
