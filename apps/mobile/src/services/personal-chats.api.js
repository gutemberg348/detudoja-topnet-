import { apiRequest } from "./api";
import { buildChatMessageFormData } from "./chat-attachments.api";

export function getPersonalChats(token) {
  return apiRequest("/api/app/personal-chats", { token });
}

export function lookupPersonalContact(token, publicId) {
  const query = new URLSearchParams({ publicId }).toString();
  return apiRequest(`/api/app/personal-chats/lookup?${query}`, { token });
}

export function sendPersonalMessageRequest(token, publicId, message) {
  return apiRequest("/api/app/personal-chats/requests", {
    body: { message, publicId },
    method: "POST",
    token,
  });
}

export function blockPersonalConversation(token, conversationId) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/block`, {
    body: {},
    method: "POST",
    token,
  });
}

export function acceptFriendInvitation(token, conversationId) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/accept`, {
    body: {},
    method: "POST",
    token,
  });
}

export function declineFriendInvitation(token, conversationId) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/decline`, {
    body: {},
    method: "POST",
    token,
  });
}

export function updateFriendAlias(token, conversationId, alias) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/alias`, {
    body: { alias },
    method: "PATCH",
    token,
  });
}

export function getPersonalConversation(token, conversationId, page = {}) {
  const query = new URLSearchParams();
  if (page.beforeMessageId) query.set("beforeMessageId", String(page.beforeMessageId));
  if (page.limit) query.set("limit", String(page.limit));
  const suffix = query.toString() ? `?${query}` : "";
  return apiRequest(`/api/app/personal-chats/${conversationId}${suffix}`, { token });
}

export function sendPersonalMessage(token, conversationId, payload) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/messages`, {
    body: buildChatMessageFormData(payload),
    method: "POST",
    token,
  });
}

export function setPersonalConversationTyping(token, conversationId, isTyping) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/typing`, {
    body: { isTyping }, method: "POST", token,
  });
}

export function markPersonalConversationRead(token, conversationId) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/read`, {
    body: {}, method: "POST", token,
  });
}
