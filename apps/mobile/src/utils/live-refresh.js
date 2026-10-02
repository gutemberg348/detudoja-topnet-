// A request received during a fetch must run again after it completes: the
// in-flight response may have been produced before the new event was emitted.
export function createLiveRefresh({ refresh, isActive, reconnect = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let disposed = false;
  let running = false;
  let dirty = false;
  let timer = null;

  async function run() {
    timer = null;
    if (disposed || !isActive() || running) return;
    running = true;
    dirty = false;
    try { await refresh(); } catch { /* Keep the last good view and retry later. */ }
    finally {
      running = false;
      if (dirty && !disposed && isActive()) request();
    }
  }

  function request() {
    if (disposed || !isActive()) return;
    dirty = true;
    if (!running && timer === null) timer = schedule(run, 120);
  }

  return {
    request,
    resume() { if (!disposed && isActive()) { reconnect(); request(); } },
    dispose() { disposed = true; if (timer !== null) cancel(timer); timer = null; },
  };
}

export function mergeConversationSnapshot(current, incoming) {
  if (!current || Number(current.id) !== Number(incoming?.id)) return incoming;
  const messages = new Map((current.messages ?? []).map((message) => [Number(message.id), message]));
  for (const message of incoming.messages ?? []) messages.set(Number(message.id), message);
  return { ...incoming, messages: [...messages.values()].sort((a, b) => Number(a.id) - Number(b.id)) };
}
