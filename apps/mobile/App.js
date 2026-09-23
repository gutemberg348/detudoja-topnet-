import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppState, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GlobalIncomingServiceAlert } from "./src/components/GlobalIncomingServiceAlert";
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
import { CartStoreProvider, useCartStore } from "./src/stores/useCartStore";
import { colors, fonts, radius, shadow, spacing } from "./src/utils/theme";

function openPushNotification(data, attempt = 0) {
  if (!data?.screen) return;
  if (!navigationRef.isReady()) {
    if (attempt < 8) setTimeout(() => openPushNotification(data, attempt + 1), 350);
    return;
  }

  const conversationId = Number(data.conversationId) || undefined;
  const orderId = Number(data.orderId) || undefined;
  if (data.screen === "ServiceDesk") {
    navigationRef.navigate("ServiceDesk", { courierRequestId: Number(data.requestId) || undefined });
  } else if (data.screen === "PersonalConversation" && conversationId) {
    navigationRef.navigate("PersonalConversation", { conversation: { id: conversationId } });
  } else if (data.screen === "StoreConversation" && (conversationId || Number(data.storeId))) {
    const storeId = Number(data.storeId) || undefined;
    navigationRef.navigate("StoreConversation", {
      ...(conversationId ? { conversation: { id: conversationId } } : {}),
      ...(orderId ? { openOrderId: orderId } : {}),
      ...(storeId ? { store: { id: storeId }, storeId } : {}),
      scope: data.scope,
    });
  } else if (data.screen === "ServiceConversation" && conversationId) {
    navigationRef.navigate("ServiceConversation", { conversation: { id: conversationId } });
  } else if (data.screen === "CustomerOrderDetails" && orderId) {
    navigationRef.navigate("CustomerOrderDetails", { order: { id: orderId } });
  } else if (data.screen === "SellerOrders") {
    navigationRef.navigate("Main", {
      params: { notificationOrderId: orderId, notificationStoreId: Number(data.storeId) || undefined },
      screen: "Vender",
    });
  }
}

export function App() {
  return (
    <SafeAreaProvider>
      <AuthStoreProvider>
        <CartStoreProvider>
          <AppContent />
        </CartStoreProvider>
      </AuthStoreProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { session } = useAuthStore();
  const [activeRouteName, setActiveRouteName] = useState("");
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
    const subscription = subscribePushNotificationResponses(openPushNotification);
    getInitialPushNotificationData().then(openPushNotification).catch(() => {});
    return () => subscription.remove();
  }, [session?.accessToken]);

  if (!fontsLoaded) {
    return <View style={styles.app} />;
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <AppNavigator onRouteChange={setActiveRouteName} />
      <GlobalCartButton activeRouteName={activeRouteName} />
      <GlobalIncomingServiceAlert navigationRef={navigationRef} />
    </View>
  );
}

const routesWithoutFloatingCart = new Set([
  "Cart",
  "Checkout",
  "CheckoutPayment",
  "GatewayPixPayment",
  "ChargePayment",
  "ChargeScan",
  "PersonalConversation",
  "ProductDetails",
  "ServiceConversation",
  "StoreConversation",
  "StorePermanentQr",
]);

function GlobalCartButton({ activeRouteName }) {
  const { itemCount } = useCartStore();
  const { session } = useAuthStore();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (
    !session
    || itemCount <= 0
    || keyboardVisible
    || routesWithoutFloatingCart.has(activeRouteName)
  ) return null;

  return (
    <Pressable
      accessibilityLabel={`Abrir carrinho com ${itemCount} itens`}
      onPress={() => navigationRef.isReady() && navigationRef.navigate("Cart")}
      style={({ pressed }) => [styles.globalCart, pressed && styles.globalCartPressed]}
    >
      <View style={styles.globalCartIcon}>
        <Ionicons color={colors.card} name="bag-handle" size={22} />
        <View style={styles.globalCartBadge}>
          <Text style={styles.globalCartBadgeText}>{itemCount > 99 ? "99+" : itemCount}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: colors.background,
    flex: 1,
  },
  globalCart: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    bottom: 84,
    height: 52,
    justifyContent: "center",
    minHeight: 52,
    position: "absolute",
    right: spacing.md,
    width: 52,
    ...shadow,
    elevation: 8,
    zIndex: 100,
  },
  globalCartBadge: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 4,
    position: "absolute",
    right: -9,
    top: -8,
  },
  globalCartBadgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
  },
  globalCartIcon: { position: "relative" },
  globalCartPressed: { opacity: 0.82 },
});
