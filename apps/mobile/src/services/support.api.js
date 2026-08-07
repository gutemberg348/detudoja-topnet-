import { apiRequest } from "./api";

export function getSupportSettings(accessToken) {
  return apiRequest("/api/app/support", { token: accessToken });
}
