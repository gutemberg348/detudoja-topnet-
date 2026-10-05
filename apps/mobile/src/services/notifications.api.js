import { apiRequest } from "./api";

export function getPushStatus(accessToken) {
  return apiRequest("/api/app/notifications/status", { token: accessToken, timeoutMs: 10_000 });
}

export function sendPushTest(accessToken, token) {
  return apiRequest("/api/app/notifications/test", { token: accessToken, method: "POST", body: { token }, timeoutMs: 10_000 });
}

export function registerExpoPushToken(accessToken, data) {
  return apiRequest("/api/app/notifications/push-token", {
    body: data,
    method: "PUT",
    token: accessToken,
    timeoutMs: 10_000,
  });
}

export function unregisterExpoPushToken(accessToken, token, { refreshAuth = true } = {}) {
  return apiRequest("/api/app/notifications/push-token", {
    body: { token },
    method: "DELETE",
    token: accessToken,
    refreshAuth,
    timeoutMs: 10_000,
  });
}
