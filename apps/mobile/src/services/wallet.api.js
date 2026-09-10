import { apiRequest } from "./api";

export function getWalletOverview(accessToken) {
  return apiRequest("/api/app/wallets", { token: accessToken });
}

export function getWalletDetails(accessToken, code) {
  return apiRequest(`/api/app/wallets/${encodeURIComponent(code)}`, {
    token: accessToken,
  });
}

export function createWalletDeposit(accessToken, payload) {
  return apiRequest("/api/app/wallets/deposits", {
    body: payload,
    method: "POST",
    token: accessToken,
  });
}

export function getWalletDeposit(accessToken, depositId) {
  return apiRequest(`/api/app/wallets/deposits/${encodeURIComponent(depositId)}`, {
    token: accessToken,
  });
}

export function refreshWalletDeposit(accessToken, depositId) {
  return apiRequest(`/api/app/wallets/deposits/${encodeURIComponent(depositId)}/refresh`, {
    method: "POST",
    token: accessToken,
  });
}
