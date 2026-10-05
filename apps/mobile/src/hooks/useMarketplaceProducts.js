import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketplaceProducts } from "../services/marketplace.api";
import { readCache } from "../services/read-cache";
import { loadNextProductPage, refreshProductFeed } from "../utils/product-feed";
import { useCachedQuery } from "./useCachedQuery";

export function useMarketplaceProducts({ key, accessToken, params, enabled }) {
  const currentKey = useRef(key);
  currentKey.current = key;
  const [more, setMore] = useState(null);
  const loadPage = useCallback((page) => getMarketplaceProducts(accessToken, {
    categoryId: params.categoryId, search: params.search, ...page,
  }), [accessToken, params.categoryId, params.search]);
  const query = useCachedQuery({
    key, enabled, requestVersion: accessToken,
    load: () => refreshProductFeed(readCache.get(key).data, loadPage),
  });
  const hasMore = Boolean(query.data?.pagination?.hasMore);
  const isLoadingMore = more?.key === key && more.loading;
  const loadMoreError = more?.key === key ? more.error : null;
  const runLoadMore = useCallback(async (retry = false) => {
    if (!enabled || !key || (more?.key === key && more.error && !retry)) return;
    const snapshot = readCache.get(key);
    if (!snapshot.data?.pagination?.hasMore || snapshot.isFetching) return;
    const revision = snapshot.revision;
    setMore({ key, loading: true, error: null });
    try {
      await loadNextProductPage(readCache, key, loadPage);
      if (currentKey.current === key) setMore(null);
    } catch (error) {
      if (error.name === "QueryInvalidatedError") {
        if (currentKey.current === key) setMore(null);
      } else if (currentKey.current === key && readCache.get(key).revision === revision) {
        setMore({ key, loading: false, error });
      } else if (currentKey.current === key) setMore(null);
    }
  }, [enabled, key, loadPage, more]);
  const loadMore = useCallback(() => runLoadMore(), [runLoadMore]);
  const retryLoadMore = useCallback(() => runLoadMore(true), [runLoadMore]);
  const refresh = useCallback(() => {
    setMore(null);
    return query.refresh();
  }, [query.refresh]);

  useEffect(() => {
    // Filtered-out service products can leave an empty page with a valid next page.
    if (query.hasData && !query.data?.products?.length && hasMore && !loadMoreError) void loadMore();
  }, [hasMore, loadMore, loadMoreError, query.data?.pagination?.nextCursor, query.data?.products?.length, query.hasData]);

  return { ...query, refresh, hasMore, isLoadingMore: Boolean(isLoadingMore), loadMore, loadMoreError, retryLoadMore };
}
