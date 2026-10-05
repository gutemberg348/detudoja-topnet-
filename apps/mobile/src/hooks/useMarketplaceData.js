import { useIsFocused } from "@react-navigation/native";
import { useEffect } from "react";
import { getMarketplaceCategories, getMarketplaceProducts, getMarketplaceStores } from "../services/marketplace.api";
import { readCache, readQueryKey } from "../services/read-cache";
import { getCurrentUserAddresses } from "../services/users.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCachedQuery } from "./useCachedQuery";
import { PRODUCT_PAGE_SIZE, refreshProductFeed } from "../utils/product-feed";

export function locationFromResponse(response) {
  if (response?.marketplaceLocation) return response.marketplaceLocation;
  const address = response?.addresses?.find((item) => item.cidade && item.estado);
  return address ? { city: address.cidade, state: address.estado } : null;
}

export const marketplaceLocationKey = (userId) => readQueryKey("marketplace-location", userId);
export const marketplaceKey = (resource, userId, location, params = {}) => readQueryKey(
  `marketplace-${resource}`, userId, location?.city ?? "", location?.state ?? "",
  params.categoryId ?? "", params.search ?? "",
  ...(resource === "products" ? ["paged", PRODUCT_PAGE_SIZE] : []),
);

export function useMarketplaceLocation() {
  const { session } = useAuthStore();
  const focused = useIsFocused();
  const query = useCachedQuery({
    key: session?.user?.id ? marketplaceLocationKey(session.user.id) : null,
    enabled: focused && Boolean(session?.accessToken),
    load: () => getCurrentUserAddresses(session.accessToken),
    requestVersion: session?.accessToken,
    staleTimeMs: 60000,
  });
  return { ...query, location: locationFromResponse(query.data) };
}

export function usePrefetchMarketplace(location, { categoryId = "", resultMode = "stores", ready = true } = {}) {
  const { session } = useAuthStore();
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused || !ready || !session?.accessToken || !session?.user?.id || !location) return undefined;
    const params = { categoryId, search: "" };
    const timer = setTimeout(() => {
      const resource = resultMode === "products" ? "products" : "stores";
      const key = marketplaceKey(resource, session.user.id, location, params);
      // Prefetch only page one; never revalidate a previously scrolled feed here.
      if (!(resource === "products" && readCache.get(key).hasData)) {
        void readCache.fetch(key, () => resource === "products"
          ? refreshProductFeed(null, (page) => getMarketplaceProducts(session.accessToken, { ...params, ...page }))
          : getMarketplaceStores(session.accessToken, params), { staleTimeMs: 30000 }).catch(() => {});
      }
      void readCache.fetch(marketplaceKey("categories", session.user.id, location),
        () => getMarketplaceCategories(session.accessToken), { staleTimeMs: 60000 }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [categoryId, focused, location?.city, location?.state, ready, resultMode, session?.accessToken, session?.user?.id]);
}
