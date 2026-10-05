export const PRODUCT_PAGE_SIZE = 12;

function appendPage(previous, response, cursor = null) {
  const items = new Map((previous?.products ?? []).map((item) => [String(item.product.id), item]));
  for (const item of response.products ?? []) items.set(String(item.product.id), item);
  const nextCursor = response.pagination?.nextCursor ?? null;
  return {
    products: [...items.values()],
    pageCount: (previous?.pageCount ?? 0) + 1,
    pagination: {
      nextCursor,
      // A repeated cursor must not cause an endless scroll/request loop.
      hasMore: Boolean(response.pagination?.hasMore && nextCursor && nextCursor !== cursor),
    },
  };
}

// Revalidate only pages already visited, in order, so insertions don't mix old cursors.
// The cache keeps the old feed visible until this entire refresh succeeds.
export async function refreshProductFeed(previous, loadPage) {
  const count = Math.max(1, previous?.pageCount ?? 1);
  let feed;
  let cursor = null;
  for (let index = 0; index < count; index++) {
    feed = appendPage(feed, await loadPage({ limit: PRODUCT_PAGE_SIZE, ...(cursor ? { cursor } : {}) }), cursor);
    if (!feed.pagination.hasMore) break;
    cursor = feed.pagination.nextCursor;
  }
  return feed;
}

export function loadNextProductPage(cache, key, loadPage) {
  const snapshot = cache.get(key);
  const feed = snapshot.data;
  if (!snapshot.hasData || snapshot.isFetching || !feed?.pagination?.hasMore) {
    return Promise.resolve(feed);
  }
  const cursor = feed.pagination.nextCursor;
  // Use the cache's in-flight/invalidation guards also for appending a page.
  return cache.fetch(key, async () => appendPage(feed,
    await loadPage({ limit: PRODUCT_PAGE_SIZE, cursor }), cursor), { force: true });
}
