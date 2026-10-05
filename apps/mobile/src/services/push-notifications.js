import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getPushStatus, registerExpoPushToken, unregisterExpoPushToken } from "./notifications.api";
import { persistPushRegistration, withPushTimeout } from "../utils/push-registration";

const isExpoGo = Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";
const storageKey = "detudoja.mobile.expoPushToken";
let notificationsPromise;
let registrationGeneration = 0;
let registrationSuspended = false;
export function cancelPushRegistration() { registrationGeneration++; registrationSuspended = true; }
export function resumePushRegistration() { registrationSuspended = false; }

export function getNotifications() {
  if (isExpoGo || Platform.OS === "web") return Promise.resolve(null);
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationHandler({ handleNotification: async () => ({
        shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
      }) });
      return Notifications;
    }).catch((error) => { notificationsPromise = null; throw error; });
  }
  return notificationsPromise;
}

export async function registerDeviceForPushNotifications(accessToken, { requestPermission = false, isCurrent: checkCurrent = () => true } = {}) {
  const generation = registrationGeneration;
  const isCurrent = () => !registrationSuspended && generation === registrationGeneration && checkCurrent();
  if (Platform.OS === "web") return { status: "web" };
  if (isExpoGo) return { status: "expo-go" };
  if (!Device.isDevice) return { status: "simulator" };
  if (!accessToken || !isCurrent()) return { status: "idle" };
  const Notifications = await getNotifications();
  if (Platform.OS === "android") {
    for (const [id, name, call] of [
      ["general", "Avisos", false], ["messages", "Conversas", false], ["orders", "Pedidos e vendas", false],
      ["courier-calls", "Chamadas de entrega", true], ["service-calls", "Chamadas de serviços", true],
    ]) {
      await Notifications.setNotificationChannelAsync(id, {
        name, importance: call ? Notifications.AndroidImportance.MAX : Notifications.AndroidImportance.HIGH,
        sound: "default", vibrationPattern: call ? [0, 250, 150, 300] : [0, 180, 100, 180],
      });
    }
  }
  let permission = await Notifications.getPermissionsAsync();
  const permitted = (value) => value.granted || value.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!permitted(permission) && requestPermission && permission.canAskAgain && isCurrent()) {
    permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  }
  if (!isCurrent()) return { status: "idle" };
  if (!permitted(permission)) {
    const oldToken = await SecureStore.getItemAsync(storageKey);
    if (oldToken && isCurrent()) await unregisterExpoPushToken(accessToken, oldToken, { refreshAuth: false }).catch(() => {});
    return { status: "denied", canAskAgain: permission.canAskAgain };
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return { status: "configuration" };
  const { data: token } = await withPushTimeout(() => Notifications.getExpoPushTokenAsync({ projectId }));
  const saved = await persistPushRegistration({ accessToken, token, platform: Platform.OS, isCurrent,
    channels: Platform.OS === "android" ? ["general", "messages", "orders", "courier-calls", "service-calls"] : [],
    storage: { get: () => SecureStore.getItemAsync(storageKey), set: value => SecureStore.setItemAsync(storageKey, value) },
    register: registerExpoPushToken, unregister: unregisterExpoPushToken,
  });
  if (!saved) return { status: "idle" };
  const server = await getPushStatus(accessToken);
  if (!server.enabled) return { status: "server-disabled", token };
  if (["InvalidCredentials", "MismatchSenderId"].includes(server.lastDelivery?.errorCode)) return { status: "configuration", token };
  let quiet = permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    || permission.ios?.allowsSound === false || permission.ios?.allowsAlert === false;
  if (Platform.OS === "android") {
    const channels = await Notifications.getNotificationChannelsAsync();
    quiet = channels.some(channel => ["messages", "service-calls", "courier-calls"].includes(channel.id)
      && (channel.importance < Notifications.AndroidImportance.DEFAULT || channel.sound === null));
  }
  return { status: quiet ? "quiet" : "ready", token };
}

export function subscribePushNotificationResponses(onResponse) {
  let active = true, subscription;
  void getNotifications().then((Notifications) => {
    if (!active || !Notifications) return;
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      onResponse({ id: response.notification.request.identifier, data: response.notification.request.content.data ?? {} });
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });
  }).catch(() => {});
  return { remove() { active = false; subscription?.remove(); } };
}

export async function getInitialPushNotificationData() {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  await Notifications.clearLastNotificationResponseAsync();
  return { id: response.notification.request.identifier, data: response.notification.request.content.data ?? {} };
}

export function subscribePushTokenChanges(onChange) {
  let active = true, subscription;
  void getNotifications().then((Notifications) => {
    if (active && Notifications) subscription = Notifications.addPushTokenListener(onChange);
  }).catch(() => {});
  return { remove() { active = false; subscription?.remove(); } };
}
