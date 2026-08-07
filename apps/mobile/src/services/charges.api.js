import { apiRequest } from "./api";

export function getCharge(accessToken, code) {
  return apiRequest(`/api/app/payments/charges/${encodeURIComponent(code)}`, {
    token: accessToken,
  });
}

export function payChargeWithWallet(accessToken, code) {
  return apiRequest(
    `/api/app/payments/charges/${encodeURIComponent(code)}/pay-with-wallet`,
    {
      body: {},
      method: "POST",
      token: accessToken,
    },
  );
}
