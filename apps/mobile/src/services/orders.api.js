import { apiRequest } from "./api";

export function createCheckoutOrder(accessToken, data) {
  return apiRequest("/api/app/orders/checkout", {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function createOnlineOrderRequest(accessToken, data) {
  return apiRequest("/api/app/orders/requests", {
    body: data,
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

export function completeCustomerOrder(accessToken, orderId) {
  return apiRequest(`/api/app/orders/${orderId}/complete`, {
    method: "PATCH",
    token: accessToken,
  });
}

export function sendCustomerOrderMessage(accessToken, orderId, message) {
  return apiRequest(`/api/app/orders/${orderId}/messages`, {
    body: { message },
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
