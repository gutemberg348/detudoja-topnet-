import assert from "node:assert/strict";
import test from "node:test";
import { googleConfigurationError, googleErrorMessage, performNativeGoogleLogin } from "../src/utils/google-auth.js";
import appConfig from "../app.config.js";

const config = { platform: "android", webClientId: "web.apps.googleusercontent.com" };
function sdk(signIn) {
  return { configure(options) { assert.equal(options.webClientId, config.webClientId); assert.equal(options.offlineAccess, false); },
    async hasPlayServices() { return true; }, signIn };
}
test("Android usa ID Web; iOS exige credencial propria", () => {
  assert.equal(googleConfigurationError(config), null);
  assert.equal(googleConfigurationError({ ...config, webClientId: "token" }), "GOOGLE_WEB_CLIENT_MISSING");
  assert.equal(googleConfigurationError({ ...config, platform: "ios", iosClientId: config.webClientId }), "GOOGLE_IOS_CLIENT_MISSING");
});
test("login pode repetir inclusive quando o SDK retorna a mesma identidade", async () => {
  let calls = 0;
  const googleSignin = sdk(async () => { calls++; return { type: "success", data: { idToken: "identity" } }; });
  for (let i = 0; i < 3; i++) assert.equal(await performNativeGoogleLogin({ ...config, googleSignin }), "identity");
  assert.equal(calls, 3);
});
test("cancelamento e falha nao bloqueiam nova tentativa", async () => {
  let calls = 0;
  const googleSignin = sdk(async () => {
    calls++;
    if (calls === 1) return { type: "cancelled" };
    if (calls === 2) throw new Error("offline");
    return { type: "success", data: { idToken: "new-identity" } };
  });
  assert.equal(await performNativeGoogleLogin({ ...config, googleSignin }), null);
  await assert.rejects(performNativeGoogleLogin({ ...config, googleSignin }), /offline/);
  assert.equal(await performNativeGoogleLogin({ ...config, googleSignin }), "new-identity");
});
test("identidade ausente nunca e enviada ao backend", async () => {
  await assert.rejects(performNativeGoogleLogin({ ...config, googleSignin: sdk(async () => ({ type: "success", data: {} })) }), { code: "GOOGLE_TOKEN_MISSING" });
});
test("Google indisponivel e assinatura errada tem mensagens diferentes", async () => {
  const googleSignin = sdk(async () => assert.fail("nao deve abrir sem Play Services"));
  googleSignin.hasPlayServices = async () => false;
  await assert.rejects(performNativeGoogleLogin({ ...config, googleSignin }), { code: "PLAY_SERVICES_NOT_AVAILABLE" });
  assert.match(googleErrorMessage({ code: "10" }), /SHA-1/);
  assert.match(googleErrorMessage({ code: "PLAY_SERVICES_NOT_AVAILABLE" }), /Atualize/);
  assert.equal(googleErrorMessage({ code: "SIGN_IN_CANCELLED" }), "");
});

test("plugin iOS registra esquema reverso somente para ID iOS separado", () => {
  const originalWeb = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const originalIos = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  try {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web.apps.googleusercontent.com";
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "ios.apps.googleusercontent.com";
    const config = { plugins: ["expo-font"], scheme: "detudoja" };
    assert.deepEqual(appConfig({ config }).plugins[1], ["@react-native-google-signin/google-signin", { iosUrlScheme: "com.googleusercontent.apps.ios" }]);
    assert.equal(appConfig({ config }).scheme, "detudoja");
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    assert.deepEqual(appConfig({ config }).plugins, ["expo-font"]);
  } finally {
    if (originalWeb === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = originalWeb;
    if (originalIos === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = originalIos;
  }
});
