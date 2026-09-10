import { apiRequest } from "./api";

export function registerExpoPushToken(accessToken, data) {
  return apiRequest("/api/app/notifications/push-token", {
    body: data,
    method: "PUT",
    token: accessToken,
  });
}

export function unregisterExpoPushToken(accessToken, token) {
  return apiRequest("/api/app/notifications/push-token", {
    body: { token },
    method: "DELETE",
    token: accessToken,
  });
}
