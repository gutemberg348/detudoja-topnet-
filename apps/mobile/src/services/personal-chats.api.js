import { apiRequest } from "./api";

export function getPersonalChats(token) {
  return apiRequest("/api/app/personal-chats", { token });
}

export function lookupPersonalContact(token, publicId) {
  const query = new URLSearchParams({ publicId }).toString();
  return apiRequest(`/api/app/personal-chats/lookup?${query}`, { token });
}

export function sendFriendInvitation(token, publicId) {
  return apiRequest("/api/app/personal-chats/requests", {
    body: { publicId },
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
