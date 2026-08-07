import { apiRequest } from "./api";

function queryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getMarketplaceCategories(accessToken) {
  return apiRequest("/api/app/marketplace/categories", { token: accessToken });
}

export function getMarketplaceStores(accessToken, params = {}) {
  return apiRequest(`/api/app/marketplace/stores${queryString(params)}`, {
    token: accessToken,
  });
}

export function getMarketplaceProducts(accessToken, params = {}) {
  return apiRequest(`/api/app/marketplace/products${queryString(params)}`, {
    token: accessToken,
  });
}

export function getMarketplaceSuggestions(accessToken, params = {}) {
  return apiRequest(`/api/app/marketplace/suggestions${queryString(params)}`, {
    token: accessToken,
  });
}

export function getMarketplaceStore(accessToken, storeId) {
  return apiRequest(`/api/app/marketplace/stores/${storeId}`, {
    token: accessToken,
  });
}
