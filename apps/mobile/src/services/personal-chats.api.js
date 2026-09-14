import { apiRequest } from "./api";

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

export function getPersonalConversation(token, conversationId) {
  return apiRequest(`/api/app/personal-chats/${conversationId}`, { token });
}

export function sendPersonalMessage(token, conversationId, message) {
  return apiRequest(`/api/app/personal-chats/${conversationId}/messages`, {
    body: { message },
    method: "POST",
    token,
  });
}
