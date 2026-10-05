const emptySnapshot = Object.freeze({
  data: undefined, error: null, hasData: false, isFetching: false, revision: 0, updatedAt: 0,
});

export class QueryInvalidatedError extends Error {
  constructor() {
    super("Query invalidated while loading");
    this.name = "QueryInvalidatedError";
  }
}

// Memory only. Keys include the account and location; auth tokens are never stored here.
export function createQueryCache({ maxEntries = 100, now = Date.now } = {}) {
  const entries = new Map();
  const listeners = new Map();
  let revision = 0;

  function notify(key) {
    listeners.get(key)?.forEach((listener) => listener());
  }

  function prune() {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries) break;
      if (!entry.promise && !listeners.has(key)) entries.delete(key);
    }
  }

  function entryFor(key) {
    let entry = entries.get(key);
    if (!entry) {
      entry = { promise: null, snapshot: { ...emptySnapshot, revision } };
      entries.set(key, entry);
    }
    // Keep recently used queries at the end of the eviction order.
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  function get(key) {
    return entries.get(key)?.snapshot ?? emptySnapshot;
  }

  function isFresh(key, staleTimeMs) {
    const snapshot = get(key);
    return snapshot.hasData && !snapshot.error && snapshot.updatedAt !== 0
      && now() - snapshot.updatedAt < staleTimeMs;
  }

  function fetchQuery(key, load, { staleTimeMs = 0, force = false } = {}) {
    const entry = entryFor(key);
    if (entry.promise) return entry.promise;
    if (!force && isFresh(key, staleTimeMs)) return Promise.resolve(entry.snapshot.data);

    entry.snapshot = { ...entry.snapshot, error: null, isFetching: true };
    const request = Promise.resolve().then(load).then((data) => {
      if (entries.get(key) !== entry) throw new QueryInvalidatedError();
      entry.snapshot = { ...entry.snapshot, data, error: null, hasData: true, isFetching: false, updatedAt: now() };
      notify(key);
      return data;
    }).catch((error) => {
      if (entries.get(key) === entry) {
        entry.snapshot = { ...entry.snapshot, error, isFetching: false };
        notify(key);
      }
      throw error;
    }).finally(() => {
      entry.promise = null;
      prune();
    });
    entry.promise = request;
    notify(key);
    prune();
    return request;
  }

  function set(key, data) {
    entries.set(key, {
      promise: null,
      snapshot: { ...emptySnapshot, data, hasData: true, revision: ++revision, updatedAt: now() },
    });
    notify(key);
    prune();
  }

  function invalidate(matches = () => true, { discardData = false } = {}) {
    for (const [key, entry] of entries) {
      if (!matches(key)) continue;
      entries.set(key, {
        promise: null,
        snapshot: { ...(discardData ? emptySnapshot : entry.snapshot),
          error: null, isFetching: false, revision: ++revision, updatedAt: 0 },
      });
      notify(key);
    }
  }

  function clear() {
    const keys = [...entries.keys()];
    entries.clear();
    revision++;
    keys.forEach(notify);
  }

  return {
    clear, fetch: fetchQuery, get, invalidate, isFresh, set,
    subscribe(key, listener) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => {
        const group = listeners.get(key);
        group?.delete(listener);
        if (!group?.size) listeners.delete(key);
        prune();
      };
    },
  };
}

// Share only concurrent reads. A later read always reaches the server.
export function createRequestFlights() {
  const pending = new Map();
  return {
    clear: () => pending.clear(),
    run(key, load) {
      if (pending.has(key)) return pending.get(key);
      const request = Promise.resolve().then(load).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
      return request;
    },
  };
}
