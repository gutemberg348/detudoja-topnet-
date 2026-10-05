import assert from "node:assert/strict";
import test from "node:test";
import { createQueryCache, QueryInvalidatedError } from "../src/utils/query-cache.js";
import { loadNextProductPage, refreshProductFeed } from "../src/utils/product-feed.js";

const item = (id) => ({ product: { id, name: `Produto ${id}` }, store: { id: 1 } });
const page = (ids, nextCursor = null) => ({ products: ids.map(item), pagination: { hasMore: Boolean(nextCursor), nextCursor } });
const ids = (feed) => feed.products.map((entry) => entry.product.id);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("opening products fetches only twelve; scrolling appends another page without duplicating products", async () => {
  const cache = createQueryCache();
  const requests = [];
  const load = async (params) => { requests.push(params); return params.cursor ? page([12, 13, 14]) : page(Array.from({ length: 12 }, (_, i) => i + 1), "page2"); };
  await cache.fetch("products", () => refreshProductFeed(null, load));
  assert.deepEqual(requests, [{ limit: 12 }]);
  await loadNextProductPage(cache, "products", load);
  assert.deepEqual(requests[1], { limit: 12, cursor: "page2" });
  assert.deepEqual(ids(cache.get("products").data), Array.from({ length: 14 }, (_, i) => i + 1));
  assert.equal(cache.get("products").data.pagination.hasMore, false);
  await loadNextProductPage(cache, "products", load);
  assert.equal(requests.length, 2);
});

test("repeated scroll events share one pending page and keep current results visible", async () => {
  const cache = createQueryCache();
  cache.set("products", await refreshProductFeed(null, () => page([1, 2], "next")));
  const pending = deferred();
  let calls = 0;
  const load = () => { calls++; return pending.promise; };
  const first = loadNextProductPage(cache, "products", load);
  await loadNextProductPage(cache, "products", load);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(ids(cache.get("products").data), [1, 2]);
  pending.resolve(page([3, 4]));
  await first;
  assert.deepEqual(ids(cache.get("products").data), [1, 2, 3, 4]);
});

test("a failed next page keeps items and cursor so retry loads the same page", async () => {
  const cache = createQueryCache();
  cache.set("products", await refreshProductFeed(null, () => page([1], "next")));
  await assert.rejects(loadNextProductPage(cache, "products", () => Promise.reject(new Error("offline"))), /offline/);
  assert.deepEqual(ids(cache.get("products").data), [1]);
  assert.equal(cache.get("products").data.pagination.nextCursor, "next");
  await loadNextProductPage(cache, "products", ({ cursor }) => { assert.equal(cursor, "next"); return page([2]); });
  assert.deepEqual(ids(cache.get("products").data), [1, 2]);
});

test("refresh rebuilds only visited pages with new cursors, while keeping old items visible", async () => {
  const cache = createQueryCache();
  cache.set("products", { products: [item(1), item(2)], pageCount: 2, pagination: { hasMore: true, nextCursor: "old" } });
  const calls = [];
  const second = deferred();
  const refresh = cache.fetch("products", () => refreshProductFeed(cache.get("products").data, ({ cursor }) => {
    calls.push(cursor); return cursor ? second.promise : page([10, 11], "new");
  }), { force: true });
  await new Promise((yes) => setImmediate(yes));
  assert.deepEqual(calls, [undefined, "new"]);
  assert.deepEqual(ids(cache.get("products").data), [1, 2]);
  second.resolve(page([12], "third"));
  await refresh;
  assert.deepEqual(ids(cache.get("products").data), [10, 11, 12]);
  assert.equal(calls.length, 2);
});

test("empty intermediate pages continue, while an exhausted feed stops refreshing early", async () => {
  const feed = await refreshProductFeed({ pageCount: 4 }, ({ cursor }) => cursor ? page([2]) : page([], "next"));
  assert.deepEqual(ids(feed), [2]);
  assert.equal(feed.pageCount, 2);
  assert.equal(feed.pagination.hasMore, false);
});

test("a repeated server cursor stops pagination instead of looping", async () => {
  const cache = createQueryCache();
  cache.set("products", await refreshProductFeed(null, () => page([1], "same")));
  await loadNextProductPage(cache, "products", () => page([2], "same"));
  assert.equal(cache.get("products").data.pagination.hasMore, false);
});

test("late pages cannot resurrect data after logout or invalidate a changed location", async () => {
  for (const invalidate of [(cache) => cache.clear(), (cache) => cache.invalidate()]) {
    const cache = createQueryCache();
    cache.set("cityA", await refreshProductFeed(null, () => page([1], "next")));
    const response = deferred();
    const request = loadNextProductPage(cache, "cityA", () => response.promise);
    await Promise.resolve();
    invalidate(cache);
    cache.set("cityB", await refreshProductFeed(null, () => page([9])));
    response.resolve(page([2]));
    await assert.rejects(request, QueryInvalidatedError);
    assert.deepEqual(ids(cache.get("cityB").data), [9]);
    assert.equal(cache.get("cityA").data?.products.some((entry) => entry.product.id === 2) ?? false, false);
  }
});

test("older API responses stay compatible and are not requested repeatedly", async () => {
  const feed = await refreshProductFeed(null, () => ({ products: [item(1)] }));
  assert.deepEqual(ids(feed), [1]);
  assert.equal(feed.pagination.hasMore, false);
});
