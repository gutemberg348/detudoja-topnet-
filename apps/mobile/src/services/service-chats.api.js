import { apiRequest } from "./api";
import { buildChatMessageFormData } from "./chat-attachments.api";

export function getServiceTypes(token, { operationalType } = {}) {
  const query = operationalType
    ? `?operationalType=${encodeURIComponent(operationalType)}`
    : "";
  return apiRequest(`/api/app/service-chats/types${query}`, { token });
}

export function getOnlineServiceProviders(token, serviceTypeId, { storeId } = {}) {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest(`/api/app/service-chats/types/${serviceTypeId}/providers${query}`, { token });
}

export function getSellerServices(token) {
  return apiRequest("/api/app/service-chats/seller-services", { token });
}

export function registerSellerService(token, data) {
  return apiRequest("/api/app/service-chats/seller-services", { body: data, method: "POST", token });
}

export function updateSellerService(token, data) {
  return apiRequest("/api/app/service-chats/seller-services", { body: data, method: "PATCH", token });
}

export function heartbeatSellerServices(token) {
  return apiRequest("/api/app/service-chats/seller-services/heartbeat", {
    body: {},
    method: "POST",
    token,
  });
}

export function getServiceConversations(token) {
  return apiRequest("/api/app/service-chats", { token });
}

export function createServiceConversation(token, sellerServiceOrData) {
  const body = typeof sellerServiceOrData === "object"
    ? sellerServiceOrData
    : { sellerServiceId: sellerServiceOrData };
  return apiRequest("/api/app/service-chats", { body, method: "POST", token });
}

export function getServiceConversation(token, conversationId, page = {}) {
  const query = new URLSearchParams();
  if (page.beforeMessageId) query.set("beforeMessageId", String(page.beforeMessageId));
  if (page.limit) query.set("limit", String(page.limit));
  const suffix = query.toString() ? `?${query}` : "";
  return apiRequest(`/api/app/service-chats/${conversationId}${suffix}`, { token });
}

export function acceptServiceConversation(token, conversationId) {
  return apiRequest(`/api/app/service-chats/${conversationId}/accept`, {
    body: {},
    method: "POST",
    token,
  });
}

export function sendServiceConversationMessage(token, conversationId, payload) {
  const body = buildChatMessageFormData(payload);
  return apiRequest(`/api/app/service-chats/${conversationId}/messages`, { body, method: "POST", token });
}

export function sendServiceConversationLocation(token, conversationId, location) {
  return apiRequest(`/api/app/service-chats/${conversationId}/locations`, {
    body: location,
    method: "POST",
    token,
  });
}

export function createServiceProposal(token, conversationId, data) {
  return apiRequest(`/api/app/service-chats/${conversationId}/proposals`, {
    body: data,
    method: "POST",
    token,
  });
}

export function acceptServiceProposal(token, conversationId, proposalId, paymentMode) {
  return apiRequest(
    `/api/app/service-chats/${conversationId}/proposals/${proposalId}/accept`,
    { body: paymentMode ? { paymentMode } : {}, method: "POST", token },
  );
}

export function declineServiceProposal(token, conversationId, proposalId) {
  return apiRequest(
    `/api/app/service-chats/${conversationId}/proposals/${proposalId}/decline`,
    { body: {}, method: "POST", token },
  );
}

export function markServiceDelivered(token, conversationId) {
  return apiRequest(`/api/app/service-chats/${conversationId}/service-delivered`, {
    body: {},
    method: "POST",
    token,
  });
}

export function confirmServiceCompletion(token, conversationId) {
  return apiRequest(`/api/app/service-chats/${conversationId}/confirm-completion`, {
    body: {},
    method: "POST",
    token,
  });
}

export function createServiceReview(token, conversationId, data) {
  return apiRequest(`/api/app/service-chats/${conversationId}/reviews`, {
    body: data,
    method: "POST",
    token,
  });
}

export function cancelServiceConversation(token, conversationId) {
  return apiRequest(`/api/app/service-chats/${conversationId}/cancel`, {
    body: {},
    method: "POST",
    token,
  });
}

export function setServiceConversationTyping(token, conversationId, isTyping) {
  return apiRequest(`/api/app/service-chats/${conversationId}/typing`, {
    body: { isTyping }, method: "POST", token,
  });
}

export function markServiceConversationRead(token, conversationId) {
  return apiRequest(`/api/app/service-chats/${conversationId}/read`, {
    body: {}, method: "POST", token,
  });
}
