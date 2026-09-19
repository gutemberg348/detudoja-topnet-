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

export function payCharge(accessToken, code, data) {
  return apiRequest(`/api/app/payments/charges/${encodeURIComponent(code)}/pay`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function getPermanentStoreQr(accessToken, token) {
  return apiRequest(`/api/app/payments/store-qr/${encodeURIComponent(token)}`, {
    token: accessToken,
  });
}

export function payPermanentStoreQr(accessToken, token, data) {
  return apiRequest(`/api/app/payments/store-qr/${encodeURIComponent(token)}/pay`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}
