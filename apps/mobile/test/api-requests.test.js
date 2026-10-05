import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequestFlights } from "../src/utils/query-cache.js";

// Execute the real API client with only its native imports and transport replaced.
const source = readFileSync(new URL("../src/services/api.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?$/gm, "").replace(/\bexport\s+/g, "");
const makeClient = new Function("Constants", "expoFetch", "NativeModules", "Platform", "requestFlights",
  "invalidateReadCacheForMutation", "globalThis", "process",
  `${source}\nreturn { apiRequest, configureAccessTokenRefresher, ApiError };`);

function response(data, status = 200) {
  return { status, ok: status >= 200 && status < 300,
    headers: { get: () => "application/json" }, json: async () => data };
}

function harness(fetch) {
  const mutations = [];
  const api = makeClient({}, fetch, {}, { OS: "web", select: (values) => values.default },
    createRequestFlights(), (path) => mutations.push(path), { fetch }, { env: { EXPO_PUBLIC_API_URL: "https://mock.invalid" } });
  return { ...api, mutations };
}

test("home, badges and profile requesting the same list concurrently send one HTTP request", async () => {
  let calls = 0;
  const api = harness(async () => { calls++; return response({ orders: [{ id: 1 }] }); });
  const results = await Promise.all(Array.from({ length: 30 }, () => api.apiRequest("/api/app/orders", { token: "user1" })));
  assert.equal(calls, 1);
  assert.deepEqual(results[0], { orders: [{ id: 1 }] });
});

test("wallet and payment status reads are never served from a completed response cache", async () => {
  let calls = 0;
  const api = harness(async () => response({ amount: ++calls }));
  assert.equal((await api.apiRequest("/api/app/wallet", { token: "user1" })).amount, 1);
  assert.equal((await api.apiRequest("/api/app/wallet", { token: "user1" })).amount, 2);
});

test("different accounts, filters and headers do not share HTTP requests", async () => {
  let calls = 0;
  const api = harness(async () => { calls++; return response({}); });
  await Promise.all([
    api.apiRequest("/stores?category=1", { token: "user1" }),
    api.apiRequest("/stores?category=1", { token: "user2" }),
    api.apiRequest("/stores?category=2", { token: "user1" }),
    api.apiRequest("/stores?category=1", { token: "user1", headers: { "X-Mode": "other" } }),
  ]);
  assert.equal(calls, 4);
});

test("payment creation and other mutations are never deduplicated", async () => {
  let calls = 0;
  const api = harness(async () => { calls++; return response({}); });
  await Promise.all(Array.from({ length: 2 }, () => api.apiRequest("/charges", {
    method: "POST", body: { amount: 100 }, token: "user1",
  })));
  assert.equal(calls, 2);
  assert.deepEqual(api.mutations, ["/charges", "/charges"]);
});

test("failed shared reads can be retried and do not invalidate successful cached screens", async () => {
  let calls = 0;
  const api = harness(async () => ++calls === 1 ? response({ message: "temporarily offline" }, 503) : response({ stores: [] }));
  const attempts = await Promise.allSettled([api.apiRequest("/stores"), api.apiRequest("/stores")]);
  assert.ok(attempts.every((attempt) => attempt.status === "rejected"));
  assert.equal(calls, 1);
  assert.deepEqual(await api.apiRequest("/stores"), { stores: [] });
  assert.deepEqual(api.mutations, []);
});

test("a shared unauthorized response still renews the token and retries successfully", async () => {
  const tokens = [];
  const api = harness(async (_, options) => {
    tokens.push(options.headers.Authorization);
    return options.headers.Authorization === "Bearer expired" ? response({}, 401) : response({ user: { id: 1 } });
  });
  let forced = 0;
  api.configureAccessTokenRefresher(async (token, { force }) => {
    if (force) { forced++; return "renewed"; }
    return token;
  });
  const results = await Promise.all([api.apiRequest("/profile", { token: "expired" }), api.apiRequest("/profile", { token: "expired" })]);
  assert.equal(forced, 1);
  assert.deepEqual(tokens, ["Bearer expired", "Bearer renewed"]);
  assert.equal(results[1].user.id, 1);
});

test("explicit old-account cleanup never invokes the current-account refresher", async () => {
  let requestedToken;
  const api = harness(async (_, options) => { requestedToken = options.headers.Authorization; return response(null, 204); });
  api.configureAccessTokenRefresher(async () => { throw new Error("must not refresh"); });
  await api.apiRequest("/push-token", { method: "DELETE", token: "old-user", refreshAuth: false });
  assert.equal(requestedToken, "Bearer old-user");
});
