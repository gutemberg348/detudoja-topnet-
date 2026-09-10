import { apiRequest } from "./api";

export function getWithdrawalOverview(accessToken) {
  return apiRequest("/api/app/withdrawals", { token: accessToken });
}

export function getWithdrawalPixAccount(accessToken) {
  return apiRequest("/api/app/withdrawals/pix-account", { token: accessToken });
}

export function saveWithdrawalPixAccount(accessToken, data) {
  return apiRequest("/api/app/withdrawals/pix-account", {
    body: data,
    method: "PUT",
    token: accessToken,
  });
}

export function createWithdrawal(accessToken, data) {
  return apiRequest("/api/app/withdrawals", {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function cancelWithdrawal(accessToken, withdrawalId) {
  return apiRequest(`/api/app/withdrawals/${withdrawalId}/cancel`, {
    method: "POST",
    token: accessToken,
  });
}
