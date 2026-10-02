import Constants from "expo-constants";
import { Platform } from "react-native";
import { performNativeGoogleLogin } from "../utils/google-auth";

export function getGoogleSignInUnavailableReason() {
  return Constants.executionEnvironment === "storeClient"
    ? "O login Google esta disponivel no aplicativo instalado. Para testar, use o APK; o Expo Go nao oferece esse recurso."
    : "";
}

export async function signInWithNativeGoogle() {
  if (Constants.executionEnvironment === "storeClient") {
    throw Object.assign(new Error("Development or release build required"), { code: "GOOGLE_EXPO_GO_UNSUPPORTED" });
  }
  let googleSignin;
  try {
    // Lazy loading keeps password/Apple login usable in Expo Go and older binaries.
    googleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
  } catch {
    throw Object.assign(new Error("Native Google module missing"), { code: "GOOGLE_NATIVE_MODULE_MISSING" });
  }
  return performNativeGoogleLogin({
    googleSignin,
    platform: Platform.OS,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "",
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "",
  });
}

export async function signOutNativeGoogle() {
  if (Constants.executionEnvironment === "storeClient") return;
  try {
    await require("@react-native-google-signin/google-signin").GoogleSignin.signOut();
  } catch {
    // An unavailable SDK must never prevent clearing the app's own session.
  }
}
