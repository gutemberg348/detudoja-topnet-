// Touches and measureInWindow use window coordinates. Subtract the overlay's
// origin once, including any safe-area offset, instead of guessing cart position.
export function cartFlightGeometry(origin, target, host, dotSize = 16) {
  return {
    startX: origin.pageX - host.x - dotSize / 2,
    startY: origin.pageY - host.y - dotSize / 2,
    deltaX: target.x + target.width / 2 - origin.pageX,
    deltaY: target.y + target.height / 2 - origin.pageY,
  };
}

export function cartPressOrigin(event) {
  const native = event?.nativeEvent;
  const candidates = [native?.touches?.[0], native?.changedTouches?.[0], native];
  for (const point of candidates) {
    if (Number.isFinite(point?.pageX) && Number.isFinite(point?.pageY)) {
      return { pageX: point.pageX, pageY: point.pageY };
    }
  }
  return null;
}

// The first addition mounts the cart; dismissing the keyboard also mounts it.
// Native measurements can lag behind both events, so retry until layout is ready.
export function createCartFlightQueue({
  getTarget, getHost, onFlights, now = Date.now,
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let pending = [];
  let timer = null;
  let sequence = 0;
  let disposed = false;
  const fresh = (entry) => now() - entry.createdAt < 2000;
  const validRect = (x, y, width, height) =>
    [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;

  function flush() {
    if (disposed) return;
    pending = pending.filter(fresh);
    if (!pending.length) return;
    if (timer === null) {
      timer = schedule(() => { timer = null; flush(); }, 32);
    }
    const target = getTarget();
    const host = getHost();
    if (!target || !host) return;
    const batch = new Set(pending.map((entry) => entry.id));
    const current = () => !disposed && getTarget() === target && getHost() === host;
    target.measureInWindow((x, y, width, height) => {
      if (!current() || !validRect(x, y, width, height)) return;
      host.measureInWindow((hostX, hostY, hostWidth, hostHeight) => {
        if (!current() || !validRect(hostX, hostY, hostWidth, hostHeight)) return;
        const ready = pending.filter((entry) => batch.has(entry.id) && fresh(entry));
        pending = pending.filter((entry) => !batch.has(entry.id) && fresh(entry));
        if (!pending.length && timer !== null) { cancel(timer); timer = null; }
        if (ready.length) onFlights(ready.map((entry) => ({
          id: entry.id,
          ...cartFlightGeometry(entry.origin, { x, y, width, height }, { x: hostX, y: hostY }),
        })));
      });
    });
  }

  return {
    flush,
    enqueue(origin) {
      if (disposed || !Number.isFinite(origin?.pageX) || !Number.isFinite(origin?.pageY)) return;
      pending = [...pending, { id: ++sequence, origin, createdAt: now() }].slice(-8);
      flush();
    },
    dispose() {
      disposed = true;
      pending = [];
      if (timer !== null) cancel(timer);
      timer = null;
    },
  };
}
