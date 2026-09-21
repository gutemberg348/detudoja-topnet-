import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { registerExpoPushToken } from "./notifications.api";

const isExpoGo = Constants.appOwnership === "expo"
  || Constants.executionEnvironment === "storeClient";
let notificationsPromise = null;

function getNotifications() {
  if (isExpoGo || Platform.OS === "web") return Promise.resolve(null);
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return Notifications;
    });
  }
  return notificationsPromise;
}

function easProjectId() {
  return Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ?? null;
}

export async function registerDeviceForPushNotifications(accessToken) {
  if (isExpoGo || Platform.OS === "web" || !Device.isDevice || !accessToken) return null;
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("general", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Mensagens e atualizacoes",
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
    });
    await Notifications.setNotificationChannelAsync("messages", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Conversas",
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
    });
    await Notifications.setNotificationChannelAsync("orders", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Pedidos e vendas",
      sound: "default",
      vibrationPattern: [0, 220, 120, 220],
    });
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
  let active = true;
  let subscription = null;

  void getNotifications().then((Notifications) => {
    if (!active || !Notifications) return;
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      onResponse(response.notification.request.content.data ?? {});
    });
  });

  return {
    remove() {
      active = false;
      subscription?.remove();
    },
  };
}

export async function getInitialPushNotificationData() {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  return response?.notification.request.content.data ?? null;
}
