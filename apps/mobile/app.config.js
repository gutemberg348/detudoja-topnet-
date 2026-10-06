import { androidPushConfig } from "./scripts/android-push-config.cjs";
import { fileURLToPath } from "node:url";

export default ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
  // EAS file variable containing google-services.json for native FCM setup.
  const pushConfig = androidPushConfig(fileURLToPath(new URL(".", import.meta.url)), config.android?.package,
    process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile);
  const hasIosClient = /^[\w-]+\.apps\.googleusercontent\.com$/.test(iosClientId)
    && iosClientId !== webClientId;
  return {
    ...config,
    android: { ...config.android, ...(pushConfig.configured ? { googleServicesFile: pushConfig.file } : {}) },
    extra: { ...config.extra, androidPushConfigured: pushConfig.configured },
    // Without Firebase, Android uses native autolinking. This plugin registers
    // the iOS callback only when a separate iOS credential has been configured.
    plugins: [
      ...(config.plugins ?? []),
      ...(hasIosClient ? [["@react-native-google-signin/google-signin", {
        iosUrlScheme: iosClientId.split(".").reverse().join("."),
      }]] : []),
    ],
  };
};
