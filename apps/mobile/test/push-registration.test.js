import test from "node:test";
import assert from "node:assert/strict";
import { persistPushRegistration, withPushTimeout } from "../src/utils/push-registration.js";

function setup() {
  let active = true, stored = "old-token";
  const registrations = [], removals = [];
  return { options: { accessToken: "original-session", token: "new-token", platform: "ios",
    isCurrent: () => active, storage: { get: async () => stored, set: async value => { stored = value; } },
    register: async (...args) => registrations.push(args), unregister: async (...args) => removals.push(args),
  }, registrations, removals, deactivate: () => { active = false; }, stored: () => stored };
}

test("token rotation registers the new phone token before removing the old one", async () => {
  const h = setup();
  assert.equal(await persistPushRegistration(h.options), true);
  assert.equal(h.stored(), "new-token");
  assert.deepEqual(h.removals[0], ["original-session", "old-token", { refreshAuth: false }]);
});

test("logout during registration removes the late token without refreshing into another account", async () => {
  const h = setup();
  h.options.register = async () => { h.deactivate(); };
  assert.equal(await persistPushRegistration(h.options), false);
  assert.equal(h.stored(), "old-token");
  assert.deepEqual(h.removals[0], ["original-session", "new-token", { refreshAuth: false }]);
});

test("failure to clean a rotated token does not undo the valid new registration", async () => {
  const h = setup();
  h.options.unregister = async () => { throw new Error("Previous access token expired"); };
  assert.equal(await persistPushRegistration(h.options), true);
  assert.equal(h.stored(), "new-token");
});

test("account changes while reading storage do not save an old account's registration", async () => {
  const h = setup();
  h.options.storage.get = async () => { h.deactivate(); return "old-token"; };
  assert.equal(await persistPushRegistration(h.options), false);
  assert.equal(h.stored(), "old-token");
  assert.equal(h.removals[0][1], "new-token");
});

test("storage failure cleans up a registered device and preserves the failure for retry", async () => {
  const h = setup();
  h.options.storage.set = async () => { throw new Error("Secure storage unavailable"); };
  await assert.rejects(persistPushRegistration(h.options), /Secure storage/);
  assert.equal(h.removals[0][1], "new-token");
});

test("cancelled registration never calls the API and pending SDK work has a timeout", async () => {
  const h = setup();
  h.deactivate();
  assert.equal(await persistPushRegistration(h.options), false);
  assert.equal(h.registrations.length, 0);
  await assert.rejects(withPushTimeout(() => new Promise(() => {}), 5), /avisos/);
  assert.equal(await withPushTimeout(async () => "ok", 5), "ok");
});
