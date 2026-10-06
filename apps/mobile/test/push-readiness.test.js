import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { persistPushRegistration, pushRegistrationFailure, withPushTimeout } from "../src/utils/push-registration.js";

function device({ configured = true, granted = true, tokenError, serverError } = {}) {
  const calls = { permission: 0, token: 0, register: 0 };
  const source = readFileSync(new URL("../src/services/push-notifications.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export /g, "")
    .replace('import("expo-notifications")', "Promise.resolve(fakeNotifications)");
  const dependencies = {
    Constants: { expoConfig: { extra: { eas: { projectId: "project-test" }, androidPushConfigured: configured } } },
    Device: { isDevice: true }, Platform: { OS: "android" },
    SecureStore: { getItemAsync: async () => null, setItemAsync: async () => {} },
    getPushStatus: async () => { if (serverError) throw serverError; return { enabled: true }; },
    registerExpoPushToken: async () => { calls.register++; }, unregisterExpoPushToken: async () => {},
    persistPushRegistration, withPushTimeout,
    fakeNotifications: {
      setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
      AndroidImportance: { HIGH: 4, MAX: 5, DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
      getPermissionsAsync: async () => ({ granted, canAskAgain: true }),
      requestPermissionsAsync: async () => { calls.permission++; return { granted: true }; },
      getExpoPushTokenAsync: async () => { calls.token++; if (tokenError) throw tokenError; return { data: "test-token" }; },
      getNotificationChannelsAsync: async () => [],
    },
  };
  const register = new Function(...Object.keys(dependencies), `${source}\nreturn registerDeviceForPushNotifications;`)(...Object.values(dependencies));
  return { calls, register: options => register("session-test", options) };
}

test("permissao aceita sem Firebase informa configuracao e nao tenta gerar token", async () => {
  const h = device({ configured: false, granted: false });
  assert.deepEqual(await h.register({ requestPermission: true }), { status: "device-configuration", permissionGranted: true });
  assert.deepEqual(h.calls, { permission: 1, token: 0, register: 0 });
});

test("APK antigo com Firebase ausente nao vira erro de conexao", async () => {
  const h = device({ tokenError: new Error("Default FirebaseApp is not initialized in this process") });
  try { await h.register(); assert.fail("deveria falhar"); }
  catch (error) { assert.deepEqual(pushRegistrationFailure(error), { status: "device-configuration", permissionGranted: true }); }
  assert.equal(h.calls.permission, 0);
});

test("falha de rede apos permissao continua recuperavel sem pedir permissao novamente", async () => {
  const h = device({ serverError: new Error("Network request failed") });
  await assert.rejects(h.register(), error => {
    assert.deepEqual(pushRegistrationFailure(error), { status: "error", permissionGranted: true });
    return true;
  });
  assert.equal(h.calls.permission, 0);
});

test("so mostra pronto depois de obter token, cadastrar aparelho e conferir servidor", async () => {
  const h = device();
  assert.deepEqual(await h.register(), { status: "ready", token: "test-token", permissionGranted: true });
  assert.deepEqual(h.calls, { permission: 0, token: 1, register: 1 });
});

test("permissao negada permanece separada de configuracao e falha transitoria", async () => {
  const h = device({ granted: false });
  assert.equal((await h.register()).status, "denied");
  assert.equal(h.calls.token, 0);
  assert.equal(pushRegistrationFailure(new Error("InvalidCredentials")).status, "configuration");
  assert.equal(pushRegistrationFailure(new Error("unknown SDK error")).status, "error");
});
