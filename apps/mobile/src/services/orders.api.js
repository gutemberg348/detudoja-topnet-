import { apiRequest } from "./api";
import { buildChatMessageFormData } from "./chat-attachments.api";

export function createOrderIdempotencyKey(prefix = "order") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCheckoutOrder(accessToken, data, idempotencyKey = createOrderIdempotencyKey("checkout")) {
  return apiRequest("/api/app/orders/checkout", {
    body: data,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    token: accessToken,
  });
}

export function createOnlineOrderRequest(accessToken, data, idempotencyKey = createOrderIdempotencyKey("request")) {
  return apiRequest("/api/app/orders/requests", {
    body: data,
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
    token: accessToken,
  });
}

export function getCustomerOrders(accessToken, { storeId } = {}) {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";

  return apiRequest(`/api/app/orders${query}`, { token: accessToken });
}

export function getCustomerOrderMessages(accessToken, orderId) {
  return apiRequest(`/api/app/orders/${orderId}/messages`, { token: accessToken });
}

export function refreshCustomerOrderPayment(accessToken, orderId) {
  return apiRequest(`/api/app/orders/${orderId}/payment/refresh`, {
    method: "POST",
    token: accessToken,
  });
}

export function completeCustomerOrder(accessToken, orderId) {
  return apiRequest(`/api/app/orders/${orderId}/complete`, {
    method: "PATCH",
    token: accessToken,
  });
}

export function cancelCustomerOrder(accessToken, orderId, { refundDestination } = {}) {
  return apiRequest(`/api/app/orders/${orderId}/cancel`, {
    body: refundDestination ? { refundDestination } : {},
    method: "PATCH",
    token: accessToken,
  });
}

export function sendCustomerOrderMessage(accessToken, orderId, payload) {
  return apiRequest(`/api/app/orders/${orderId}/messages`, {
    body: buildChatMessageFormData(payload),
    method: "POST",
    token: accessToken,
  });
}

export function acceptCustomerOrderProposal(accessToken, orderId, proposalId) {
  return apiRequest(`/api/app/orders/${orderId}/proposals/${proposalId}/accept`, {
    method: "PATCH",
    token: accessToken,
  });
}

export function declineCustomerOrderProposal(accessToken, orderId, proposalId) {
  return apiRequest(`/api/app/orders/${orderId}/proposals/${proposalId}/decline`, {
    method: "PATCH",
    token: accessToken,
  });
}

export function payCustomerOrderProposal(accessToken, orderId, proposalId, data) {
  return apiRequest(`/api/app/orders/${orderId}/proposals/${proposalId}/pay`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}
