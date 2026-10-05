import { createQueryCache, createRequestFlights } from "../utils/query-cache";

export const readCache = createQueryCache();
export const requestFlights = createRequestFlights();
export const readQueryKey = (resource, userId, ...scope) => JSON.stringify([resource, String(userId), ...scope]);

export function clearMobileReadCache() {
  readCache.clear();
  requestFlights.clear();
}

export function invalidateReadCacheForMutation(path) {
  const resources = new Set();
  if (path.startsWith("/api/app/kyc") || path === "/api/app/auth/complete-cpf") resources.add("profile");
  if (path.startsWith("/api/app/users/me")) {
    resources.add("marketplace-location");
    resources.add("profile");
  }
  if (path.startsWith("/api/app/users/me") || path.startsWith("/api/app/seller/")) {
    for (const resource of ["marketplace-categories", "marketplace-stores", "marketplace-products", "marketplace-suggestions"]) resources.add(resource);
  }
  if (path.startsWith("/api/app/seller/")) {
    resources.add("seller-segments");
    resources.add("seller-categories");
  }
  if (path.startsWith("/api/app/service-chats/seller-services") && !path.endsWith("/heartbeat")) {
    resources.add("marketplace-service-types");
    resources.add("marketplace-suggestions");
  }
  if (resources.size) readCache.invalidate((key) => resources.has(JSON.parse(key)[0]));
}
