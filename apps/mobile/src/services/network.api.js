import { apiRequest } from "./api";

export function getNetworkOverview(accessToken) {
  return apiRequest("/api/app/network", { token: accessToken });
}
