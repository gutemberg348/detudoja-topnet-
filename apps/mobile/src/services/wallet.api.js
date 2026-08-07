import { apiRequest } from "./api";

export function getWalletOverview(accessToken) {
  return apiRequest("/api/app/wallets", { token: accessToken });
}

export function getWalletDetails(accessToken, code) {
  return apiRequest(`/api/app/wallets/${encodeURIComponent(code)}`, {
    token: accessToken,
  });
}
