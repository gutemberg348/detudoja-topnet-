import assert from "node:assert/strict";
import test from "node:test";
import { cartFlightGeometry, cartPressOrigin, createCartFlightQueue } from "../src/utils/cart-feedback.js";

test("dot starts at the tap and ends at the measured cart center", () => {
  const origin = { pageX: 150, pageY: 300 };
  const target = { x: 322, y: 740, width: 52, height: 52 };
  const host = { x: 0, y: 0 };
  const flight = cartFlightGeometry(origin, target, host);
  assert.equal(flight.startX + 8, origin.pageX);
  assert.equal(flight.startY + 8, origin.pageY);
  assert.equal(flight.startX + flight.deltaX + 8, 348);
  assert.equal(flight.startY + flight.deltaY + 8, 766);
});

test("safe area / overlay offset is subtracted exactly once", () => {
  const origin = { pageX: 280, pageY: 800 };
  const target = { x: 320, y: 700, width: 52, height: 52 };
  const host = { x: 12, y: 59 };
  const flight = cartFlightGeometry(origin, target, host);
  assert.equal(flight.startX + 8 + host.x, origin.pageX);
  assert.equal(flight.startY + 8 + host.y, origin.pageY);
  assert.equal(flight.startX + flight.deltaX + 8 + host.x, 346);
  assert.equal(flight.startY + flight.deltaY + 8 + host.y, 726);
});

test("supports upward flights and touches at the screen edge", () => {
  const flight = cartFlightGeometry({ pageX: 0, pageY: 500 },
    { x: 280, y: 80, width: 48, height: 48 }, { x: 0, y: 0 });
  assert.equal(flight.startX, -8);
  assert.equal(flight.deltaX, 304);
  assert.equal(flight.deltaY, -396);
});

test("reads press location from both native touch arrays and ordinary press events", () => {
  const point = { pageX: 0, pageY: 360 };
  assert.deepEqual(cartPressOrigin({ nativeEvent: point }), point);
  assert.deepEqual(cartPressOrigin({ nativeEvent: { touches: [point] } }), point);
  assert.deepEqual(cartPressOrigin({ nativeEvent: { touches: [], changedTouches: [point] } }), point);
  assert.equal(cartPressOrigin({ nativeEvent: {} }), null);
  assert.equal(cartPressOrigin({ nativeEvent: { pageX: NaN, pageY: 1 } }), null);
});

const measured = (...rect) => ({ measureInWindow: (callback) => callback(...rect) });
function queueHarness() {
  let time = 0;
  let nextTimer = 0;
  const timers = new Map();
  const state = {
    target: null,
    host: measured(0, 59, 390, 785),
    flights: [],
    tick(ms = 32) {
      time += ms;
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    get timerCount() { return timers.size; },
  };
  state.queue = createCartFlightQueue({
    getTarget: () => state.target,
    getHost: () => state.host,
    onFlights: (flights) => state.flights.push(...flights),
    now: () => time,
    schedule: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    cancel: (id) => timers.delete(id),
  });
  return state;
}

test("first addition waits for cart mount and non-zero native layout", () => {
  const h = queueHarness();
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  assert.equal(h.flights.length, 0);
  h.target = measured(0, 0, 0, 0);
  h.tick();
  assert.equal(h.flights.length, 0);
  h.target = measured(322, 700, 52, 52);
  h.tick();
  assert.equal(h.flights.length, 1);
  const flight = h.flights[0];
  assert.equal(flight.startX + flight.deltaX + 8, 348);
  assert.equal(flight.startY + flight.deltaY + 8 + 59, 726);
  assert.equal(h.timerCount, 0);
});

test("waits for the actual overlay to mount and measure", () => {
  const h = queueHarness();
  h.target = measured(322, 700, 52, 52);
  h.host = null;
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  h.host = measured(0, 0, 0, 0);
  h.tick();
  assert.equal(h.flights.length, 0);
  h.host = measured(0, 0, 390, 844);
  h.tick();
  assert.equal(h.flights.length, 1);
});

test("ref detach and stale native callbacks do not consume pending additions", () => {
  const h = queueHarness();
  let staleCallback;
  h.target = { measureInWindow: (callback) => { staleCallback = callback; } };
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  h.target = null;
  staleCallback(322, 700, 52, 52);
  h.tick();
  assert.equal(h.flights.length, 0);
  h.target = measured(322, 700, 52, 52);
  h.tick();
  assert.equal(h.flights.length, 1);
});

test("repeated measurement callbacks emit each rapid tap only once", () => {
  const h = queueHarness();
  const callbacks = [];
  h.target = { measureInWindow: (callback) => callbacks.push(callback) };
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  h.queue.enqueue({ pageX: 95, pageY: 455 });
  h.queue.enqueue({ pageX: 100, pageY: 460 });
  h.tick();
  callbacks.reverse().forEach((callback) => callback(322, 700, 52, 52));
  assert.equal(h.flights.length, 3);
  assert.equal(new Set(h.flights.map((flight) => flight.id)).size, 3);
  assert.equal(h.timerCount, 0);
});

test("expires flights when navigation leaves no visible cart, without polling forever", () => {
  const h = queueHarness();
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  h.tick(2001);
  h.target = measured(322, 700, 52, 52);
  h.queue.flush();
  assert.equal(h.flights.length, 0);
  assert.equal(h.timerCount, 0);
});

test("unmount cancels retries and ignores in-flight native measurements", () => {
  const h = queueHarness();
  let callback;
  h.target = { measureInWindow: (next) => { callback = next; } };
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  h.queue.dispose();
  callback(322, 700, 52, 52);
  h.queue.enqueue({ pageX: 90, pageY: 450 });
  assert.equal(h.flights.length, 0);
  assert.equal(h.timerCount, 0);
});
