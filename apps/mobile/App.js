import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { AppNavigator, navigationRef } from "./src/navigation/AppNavigator";
import { heartbeatSellerServices } from "./src/services/service-chats.api";
import {
  getInitialPushNotificationData,
  registerDeviceForPushNotifications,
  subscribePushNotificationResponses,
} from "./src/services/push-notifications";
import {
  AuthStoreProvider,
  useAuthStore,
} from "./src/stores/useAuthStore";
import { colors } from "./src/utils/theme";

export function App() {
  return (
    <AuthStoreProvider>
      <AppContent />
    </AuthStoreProvider>
  );
}

function AppContent() {
  const { session } = useAuthStore();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) return undefined;
    let appState = AppState.currentState;
    let timer = null;
    const sendHeartbeat = () => { heartbeatSellerServices(token).catch(() => {}); };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      sendHeartbeat();
      timer = setInterval(sendHeartbeat, 45_000);
    };
    const subscription = AppState.addEventListener("change", (nextState) => {
      const becameActive = appState !== "active" && nextState === "active";
      appState = nextState;
      if (becameActive) {
        stop();
        start();
      } else if (nextState !== "active") {
        stop();
      }
    });
    if (appState === "active") start();
    return () => {
      stop();
      subscription.remove();
    };
  }, [session?.accessToken]);

  useEffect(() => {
    registerDeviceForPushNotifications(session?.accessToken).catch(() => {});
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const openNotification = (data) => {
      if (data?.screen === "ServiceDesk" && navigationRef.isReady()) {
        navigationRef.navigate("ServiceDesk", { courierRequestId: Number(data.requestId) || undefined });
      }
    };
    const subscription = subscribePushNotificationResponses(openNotification);
    getInitialPushNotificationData().then(openNotification).catch(() => {});
    return () => subscription.remove();
  }, [session?.accessToken]);

  if (!fontsLoaded) {
    return <View style={styles.app} />;
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <AppNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
