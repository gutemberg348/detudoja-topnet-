export default ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
  const hasIosClient = /^[\w-]+\.apps\.googleusercontent\.com$/.test(iosClientId)
    && iosClientId !== webClientId;
  return {
    ...config,
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
