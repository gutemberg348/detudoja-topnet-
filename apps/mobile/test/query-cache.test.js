import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createQueryCache, createRequestFlights, QueryInvalidatedError } from "../src/utils/query-cache.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const key = (user = 1, city = "Manaus", category = "", search = "", resource = "stores") =>
  JSON.stringify([resource, user, city, category, search]);

test("home prefetch and search screen share a request, then returning to a tab is immediate", async () => {
  const cache = createQueryCache();
  const network = deferred();
  let calls = 0;
  const load = () => { calls++; return network.promise; };
  const prefetch = cache.fetch(key(), load, { staleTimeMs: 30000 });
  const screen = cache.fetch(key(), load, { staleTimeMs: 30000 });
  assert.equal(prefetch, screen);
  await Promise.resolve();
  assert.equal(calls, 1);
  network.resolve({ stores: [{ id: 1 }] });
  await screen;
  for (let i = 0; i < 20; i++) {
    assert.equal(cache.get(key()).hasData, true);
    await cache.fetch(key(), load, { staleTimeMs: 30000 });
  }
  assert.equal(calls, 1);
});

test("expired results stay visible while a background update runs", async () => {
  let clock = 1000;
  const cache = createQueryCache({ now: () => clock });
  cache.set(key(), { stores: [{ id: 1 }] });
  clock += 30001;
  const network = deferred();
  const update = cache.fetch(key(), () => network.promise, { staleTimeMs: 30000 });
  assert.deepEqual(cache.get(key()).data.stores, [{ id: 1 }]);
  assert.equal(cache.get(key()).isFetching, true);
  network.resolve({ stores: [{ id: 2 }] });
  await update;
  assert.deepEqual(cache.get(key()).data.stores, [{ id: 2 }]);
});

test("a failed background update preserves the list and can recover", async () => {
  const cache = createQueryCache();
  cache.set(key(), { stores: [{ id: 1 }] });
  await assert.rejects(cache.fetch(key(), () => Promise.reject(new Error("offline")), { force: true }), /offline/);
  assert.equal(cache.get(key()).hasData, true);
  assert.deepEqual(cache.get(key()).data.stores, [{ id: 1 }]);
  await cache.fetch(key(), () => ({ stores: [{ id: 2 }] }), { staleTimeMs: 30000 });
  assert.equal(cache.get(key()).error, null);
  assert.deepEqual(cache.get(key()).data.stores, [{ id: 2 }]);
});

test("empty results are cached too, avoiding repeated empty-screen requests", async () => {
  const cache = createQueryCache();
  await cache.fetch(key(), () => ({ stores: [] }), { staleTimeMs: 30000 });
  await cache.fetch(key(), () => { throw new Error("must not reload"); }, { staleTimeMs: 30000 });
  assert.equal(cache.get(key()).hasData, true);
  assert.deepEqual(cache.get(key()).data.stores, []);
});

test("account, city, category, term and result mode each have their own data", async () => {
  const cache = createQueryCache();
  cache.set(key(), { stores: [{ id: 1 }] });
  for (const other of [key(2), key(1, "Belem"), key(1, "Manaus", "food"), key(1, "Manaus", "", "pizza"), key(1, "Manaus", "", "", "products")]) {
    assert.equal(cache.get(other).hasData, false);
  }
  assert.equal(cache.get(key()).data.stores[0].id, 1);
});

test("a slow response for a previous filter cannot replace the current filter", async () => {
  const cache = createQueryCache();
  const old = deferred();
  const oldKey = key(1, "Manaus", "food");
  const nextKey = key(1, "Manaus", "clothing");
  const pending = cache.fetch(oldKey, () => old.promise);
  await cache.fetch(nextKey, () => ({ stores: [{ id: 2 }] }));
  old.resolve({ stores: [{ id: 1 }] });
  await pending;
  assert.equal(cache.get(nextKey).data.stores[0].id, 2);
});

test("catalog mutation invalidates an in-flight read and allows a new read immediately", async () => {
  const cache = createQueryCache();
  const beforeWrite = deferred();
  const oldRead = cache.fetch(key(), () => beforeWrite.promise);
  const rejected = assert.rejects(oldRead, QueryInvalidatedError);
  cache.invalidate();
  await cache.fetch(key(), () => ({ stores: [{ id: 2 }] }));
  beforeWrite.resolve({ stores: [{ id: 1 }] });
  await rejected;
  assert.equal(cache.get(key()).data.stores[0].id, 2);
});

test("confirmed location data wins over an older address request", async () => {
  const cache = createQueryCache();
  const old = deferred();
  const read = cache.fetch("location:1", () => old.promise);
  const rejected = assert.rejects(read, QueryInvalidatedError);
  cache.set("location:1", { city: "Belem" });
  old.resolve({ city: "Manaus" });
  await rejected;
  assert.equal(cache.get("location:1").data.city, "Belem");
});

test("logout drops saved data and prevents late requests from restoring it", async () => {
  const cache = createQueryCache();
  cache.set(key(), { stores: [{ id: 1 }] });
  const old = deferred();
  const read = cache.fetch(key(), () => old.promise, { force: true });
  const rejected = assert.rejects(read, QueryInvalidatedError);
  cache.clear();
  assert.equal(cache.get(key()).hasData, false);
  old.resolve({ stores: [{ id: 2 }] });
  await rejected;
  assert.equal(cache.get(key()).hasData, false);
});

test("subscribed screens receive data and invalidation updates without waiting for a navigation", async () => {
  const cache = createQueryCache();
  const states = [];
  const unsubscribe = cache.subscribe(key(), () => states.push(cache.get(key())));
  await cache.fetch(key(), () => ({ stores: [] }));
  assert.equal(states[0].isFetching, true);
  assert.equal(states[1].hasData, true);
  cache.invalidate();
  assert.equal(states.at(-1).updatedAt, 0);
  assert.equal(states.at(-1).hasData, true);
  const before = states.length;
  unsubscribe();
  cache.set(key(), { stores: [{ id: 2 }] });
  assert.equal(states.length, before);
});

test("cache capacity evicts old unused terms while keeping an active screen", () => {
  const cache = createQueryCache({ maxEntries: 3 });
  const unsubscribe = cache.subscribe("active", () => {});
  cache.set("active", { id: 1 });
  for (let i = 0; i < 50; i++) cache.set(`term:${i}`, { id: i });
  assert.equal(cache.get("active").data.id, 1);
  assert.equal(cache.get("term:0").hasData, false);
  assert.equal(cache.get("term:49").data.id, 49);
  unsubscribe();
});

test("concurrent reads share transport but subsequent reads always fetch current data", async () => {
  const flights = createRequestFlights();
  let calls = 0;
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all(Array.from({ length: 50 }, () => flights.run("wallet:user1", load))), Array(50).fill(1));
  assert.equal(await flights.run("wallet:user1", load), 2);
});

test("a failed shared request is removed so retry can succeed", async () => {
  const flights = createRequestFlights();
  await assert.rejects(flights.run("a", async () => { throw new Error("offline"); }), /offline/);
  assert.equal(await flights.run("a", async () => "recovered"), "recovered");
});

function resourceCache() {
  const source = readFileSync(new URL("../src/services/read-cache.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/\bexport\s+/g, "");
  return new Function("createQueryCache", "createRequestFlights", `${source}\nreturn { readCache, readQueryKey, invalidateReadCacheForMutation };`)(createQueryCache, createRequestFlights);
}

test("saving the city invalidates location and catalog while retaining data for background refresh", () => {
  const { readCache: cache, readQueryKey: keyFor, invalidateReadCacheForMutation: invalidate } = resourceCache();
  const location = keyFor("marketplace-location", 1);
  const stores = keyFor("marketplace-stores", 1, "Manaus", "AM");
  cache.set(location, { city: "Manaus" });
  cache.set(stores, { stores: [{ id: 1 }] });
  invalidate("/api/app/users/me");
  assert.equal(cache.isFresh(location, 60000), false);
  assert.equal(cache.isFresh(stores, 30000), false);
  assert.equal(cache.get(stores).hasData, true);
});

test("KYC and completing CPF invalidate cached profile so returning shows current account state", () => {
  const { readCache: cache, readQueryKey: keyFor, invalidateReadCacheForMutation: invalidate } = resourceCache();
  const profile = keyFor("profile", 1);
  for (const path of ["/api/app/kyc/submissions", "/api/app/auth/complete-cpf"]) {
    cache.set(profile, { user: { cpfRequired: true, kycStatus: "PENDENTE" } });
    invalidate(path);
    assert.equal(cache.isFresh(profile, 30000), false);
  }
});

test("service availability changes invalidate discovery without dropping unrelated catalog data", () => {
  const { readCache: cache, readQueryKey: keyFor, invalidateReadCacheForMutation: invalidate } = resourceCache();
  const services = keyFor("marketplace-service-types", 1);
  const suggestions = keyFor("marketplace-suggestions", 1);
  const stores = keyFor("marketplace-stores", 1);
  cache.set(services, { serviceTypes: [] });
  cache.set(suggestions, { suggestions: [] });
  cache.set(stores, { stores: [] });
  invalidate("/api/app/service-chats/seller-services");
  assert.equal(cache.isFresh(services, 10000), false);
  assert.equal(cache.isFresh(suggestions, 15000), false);
  assert.equal(cache.isFresh(stores, 30000), true);
});
