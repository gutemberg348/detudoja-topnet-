import { apiRequest } from "./api";

export function verifyKycDocument(accessToken) {
  return apiRequest("/api/app/kyc/verify", {
    method: "POST",
    token: accessToken,
  });
}
