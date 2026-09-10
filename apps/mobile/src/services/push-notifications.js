import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { registerExpoPushToken } from "./notifications.api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function easProjectId() {
  return Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ?? null;
}

export async function registerDeviceForPushNotifications(accessToken) {
  if (Platform.OS === "web" || !Device.isDevice || !accessToken) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("courier-calls", {
      importance: Notifications.AndroidImportance.MAX,
      name: "Chamadas de entrega",
      sound: "default",
      vibrationPattern: [0, 250, 150, 300],
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permission = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;

  const projectId = easProjectId();
  if (!projectId) return null;
  const response = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = response.data;
  await registerExpoPushToken(accessToken, { platform: Platform.OS, token });
  await SecureStore.setItemAsync("detudoja.mobile.expoPushToken", token);
  return token;
}

export function subscribePushNotificationResponses(onResponse) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    onResponse(response.notification.request.content.data ?? {});
  });
}

export async function getInitialPushNotificationData() {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response?.notification.request.content.data ?? null;
}
