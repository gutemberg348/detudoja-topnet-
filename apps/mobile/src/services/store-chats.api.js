import { apiRequest } from "./api";

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

export async function getStoreConversation(token, conversationId) {
  const response = await apiRequest(
    `/api/app/store-chats/${conversationId}`,
    { token },
  );

  publishConversationRead(response);
  return response;
}

export function sendStoreConversationMessage(token, conversationId, payload) {
  return apiRequest(`/api/app/store-chats/${conversationId}/messages`, {
    body: typeof payload === "string" ? { message: payload } : payload,
    method: "POST",
    token,
  });
}
