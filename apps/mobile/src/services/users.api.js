import { apiRequest } from "./api";

export function getCurrentUser(accessToken) {
  return apiRequest("/api/app/users/me", { token: accessToken });
}

export function getCurrentUserAddresses(accessToken) {
  return apiRequest("/api/app/users/me/addresses", { token: accessToken });
}

export function updateCurrentUser(accessToken, data) {
  return apiRequest("/api/app/users/me", {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}
