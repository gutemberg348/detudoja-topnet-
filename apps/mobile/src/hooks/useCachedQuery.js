import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { readCache } from "../services/read-cache";

export function useCachedQuery({ key, load, enabled = true, staleTimeMs = 30000, delayMs = 0, requestVersion }) {
  const loader = useRef(load);
  loader.current = load;
  const subscribe = useCallback((listener) => key ? readCache.subscribe(key, listener) : () => {}, [key]);
  const getSnapshot = useCallback(() => readCache.get(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!enabled || !key || readCache.isFresh(key, staleTimeMs)) return undefined;
    const currentLoad = loader.current;
    const run = () => { void readCache.fetch(key, currentLoad, { staleTimeMs }).catch(() => {}); };
    if (!delayMs) {
      run();
      return undefined;
    }
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, enabled, key, requestVersion, snapshot.revision, staleTimeMs]);

  const refresh = useCallback(() => {
    if (!enabled || !key) return Promise.resolve();
    return readCache.fetch(key, loader.current, { force: true });
  }, [enabled, key]);

  return {
    data: snapshot.data,
    error: snapshot.error,
    hasData: snapshot.hasData,
    isLoading: Boolean(key) && enabled && !snapshot.hasData && !snapshot.error,
    isRefreshing: snapshot.hasData && snapshot.isFetching,
    refresh,
  };
}
