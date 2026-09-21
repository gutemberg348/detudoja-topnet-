import { apiRequest } from "./api";
import { buildChatMessageFormData } from "./chat-attachments.api";

const readListeners = new Set();

function publishConversationRead(response) {
  const conversation = response?.conversation;

  if (!conversation?.id) {
    return;
  }

  const payload = {
    conversationId: conversation.id,
    scope: conversation.isStore ? "seller" : "customer",
    storeId: conversation.store?.id ?? null,
  };

  readListeners.forEach((listener) => listener(payload));
}

export function subscribeStoreConversationRead(listener) {
  readListeners.add(listener);

  return () => readListeners.delete(listener);
}

export async function openStoreConversation(token, storeId) {
  const response = await apiRequest(`/api/app/store-chats/stores/${storeId}/open`, {
    body: {},
    method: "POST",
    token,
  });

  publishConversationRead(response);
  return response;
}

export function getStoreConversations(
  token,
  { scope = "customer", storeId } = {},
) {
  const query = new URLSearchParams({ scope });

  if (storeId) {
    query.set("storeId", String(storeId));
  }

  return apiRequest(`/api/app/store-chats?${query.toString()}`, { token });
}

export async function getStoreConversation(token, conversationId, page = {}) {
  const query = new URLSearchParams();
  if (page.beforeMessageId) query.set("beforeMessageId", String(page.beforeMessageId));
  if (page.limit) query.set("limit", String(page.limit));
  const suffix = query.toString() ? `?${query}` : "";
  const response = await apiRequest(
    `/api/app/store-chats/${conversationId}${suffix}`,
    { token },
  );

  publishConversationRead(response);
  return response;
}

export function sendStoreConversationMessage(token, conversationId, payload) {
  return apiRequest(`/api/app/store-chats/${conversationId}/messages`, {
    body: buildChatMessageFormData(payload),
    method: "POST",
    token,
  });
}

export function trackStoreConversationActivity(token, conversationId, data) {
  return apiRequest(`/api/app/store-chats/${conversationId}/activity`, {
    body: data,
    method: "POST",
    token,
  });
}

export function setStoreConversationTyping(token, conversationId, isTyping) {
  return apiRequest(`/api/app/store-chats/${conversationId}/typing`, {
    body: { isTyping }, method: "POST", token,
  });
}

export function markStoreConversationRead(token, conversationId) {
  return apiRequest(`/api/app/store-chats/${conversationId}/read`, {
    body: {}, method: "POST", token,
  });
}
