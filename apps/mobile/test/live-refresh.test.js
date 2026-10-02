import assert from "node:assert/strict";
import test from "node:test";
import { createLiveRefresh, mergeConversationSnapshot } from "../src/utils/live-refresh.js";

function harness(refresh = async () => {}) {
  let active = true;
  let calls = 0;
  let reconnects = 0;
  let id = 0;
  const tasks = new Map();
  const queue = createLiveRefresh({
    refresh: () => { calls++; return refresh(); },
    isActive: () => active,
    reconnect: () => { reconnects++; },
    schedule: (task) => { tasks.set(++id, task); return id; },
    cancel: (key) => tasks.delete(key),
  });
  return { queue, tasks, setActive: (value) => { active = value; },
    calls: () => calls, reconnects: () => reconnects,
    async flush() { const batch = [...tasks.values()]; tasks.clear(); await Promise.all(batch.map((task) => task())); },
  };
}

test("returning to foreground reconnects and refreshes without navigating away", async () => {
  const h = harness();
  h.setActive(false);
  h.queue.resume();
  assert.equal(h.tasks.size, 0);
  h.setActive(true);
  h.queue.resume();
  await h.flush();
  assert.equal(h.calls(), 1);
  assert.equal(h.reconnects(), 1);
});

test("connect and event bursts coalesce into one refresh", async () => {
  const h = harness();
  h.queue.resume();
  for (let i = 0; i < 20; i++) h.queue.request();
  assert.equal(h.tasks.size, 1);
  await h.flush();
  assert.equal(h.calls(), 1);
});

test("a proposal arriving during a fetch schedules a trailing refresh", async () => {
  let finish;
  const h = harness(() => new Promise((resolve) => { finish = resolve; }));
  h.queue.request();
  const pending = h.flush();
  h.queue.request();
  h.queue.request();
  assert.equal(h.tasks.size, 0);
  finish();
  await pending;
  assert.equal(h.tasks.size, 1);
  const trailing = h.flush();
  finish();
  await trailing;
  assert.equal(h.calls(), 2);
});

test("backgrounding prevents queued refresh and resume restores it", async () => {
  const h = harness();
  h.queue.request();
  h.setActive(false);
  await h.flush();
  assert.equal(h.calls(), 0);
  h.setActive(true);
  h.queue.resume();
  await h.flush();
  assert.equal(h.calls(), 1);
});

test("errors do not disable future recovery checks", async () => {
  const h = harness(async () => { throw new Error("offline"); });
  h.queue.resume();
  await h.flush();
  h.queue.resume();
  await h.flush();
  assert.equal(h.calls(), 2);
});

test("leaving the screen cancels timers and trailing work", async () => {
  let finish;
  const h = harness(() => new Promise((resolve) => { finish = resolve; }));
  h.queue.request();
  const pending = h.flush();
  h.queue.request();
  h.queue.dispose();
  finish();
  await pending;
  h.queue.resume();
  assert.equal(h.tasks.size, 0);
  assert.equal(h.calls(), 1);
});

test("snapshot updates proposals without losing older pages or a just-received message", () => {
  const current = { id: 7, proposals: [], messages: [{ id: 1 }, { id: 2 }, { id: 4 }] };
  const latest = { id: 7, proposals: [{ id: 3, status: "PENDENTE" }], messages: [{ id: 2, readAt: "now" }, { id: 3 }] };
  const result = mergeConversationSnapshot(current, latest);
  assert.deepEqual(result.messages.map((message) => message.id), [1, 2, 3, 4]);
  assert.equal(result.messages[1].readAt, "now");
  assert.deepEqual(result.proposals, latest.proposals);
  assert.equal(mergeConversationSnapshot(current, { id: 8, messages: [] }).messages.length, 0);
});
