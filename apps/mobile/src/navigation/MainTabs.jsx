import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { HomeScreen } from "../app/HomeScreen";
import { NetworkScreen } from "../app/NetworkScreen";
import { ProfileScreen } from "../app/ProfileScreen";
import { SellScreen } from "../app/SellScreen";
import { StoresScreen } from "../app/StoresScreen";
import { countNewStoreOrders } from "../app/sell/seller.utils";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { getCustomerOrders } from "../services/orders.api";
import { getCourierRequests } from "../services/courier.api";
import { getSellerProfile } from "../services/seller.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getServiceConversations } from "../services/service-chats.api";
import {
  getStoreConversations,
  subscribeStoreConversationRead,
} from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius } from "../utils/theme";

const Tab = createBottomTabNavigator();

const tabIcons = {
  Buscar: ["search", "search-outline"],
  Inicio: ["home", "home-outline"],
  Perfil: ["person", "person-outline"],
  Rede: ["git-network", "git-network-outline"],
  Vender: ["storefront", "storefront-outline"],
};

const activeOrderStatuses = new Set([
  "NEGOCIANDO",
  "AGUARDANDO_PAGAMENTO",
  "RECEBIDO",
  "ACEITO",
  "PREPARANDO",
  "SAIU_ENTREGA",
  "PRONTO_RETIRADA",
]);
const sellerAttentionStatuses = new Set(["NEGOCIANDO", "RECEBIDO"]);

function isActiveOrder(order) {
  return activeOrderStatuses.has(order.status);
}

function unreadCustomerMessages(order) {
  return Number(order.unreadCustomerMessages ?? order.unreadMessagesCount ?? 0);
}

function countUnreadCustomerMessages(orders) {
  return orders.reduce((total, order) => total + unreadCustomerMessages(order), 0);
}

function countSellerStoreNotifications(stores = []) {
  return stores.reduce(
    (total, store) =>
      total + countNewStoreOrders(store, sellerAttentionStatuses),
    0,
  );
}

export function MainTabs() {
  const { session } = useAuthStore();
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [unreadCustomerMessageCount, setUnreadCustomerMessageCount] = useState(0);
  const [sellerNewOrderCount, setSellerNewOrderCount] = useState(0);
  const [sellerServiceNotificationCount, setSellerServiceNotificationCount] = useState(0);
  const [customerServiceNotificationCount, setCustomerServiceNotificationCount] = useState(0);
  const [sellerStoreChatNotificationCount, setSellerStoreChatNotificationCount] = useState(0);
  const [customerStoreChatNotificationCount, setCustomerStoreChatNotificationCount] = useState(0);
  const [sellerStoreIds, setSellerStoreIds] = useState([]);
  const needsKycNotification = session?.user?.kycStatus !== "APROVADO";
  const hasUnreadCustomerMessages = unreadCustomerMessageCount > 0;
  const hasCustomerCommunication =
    hasUnreadCustomerMessages
    || customerServiceNotificationCount > 0
    || customerStoreChatNotificationCount > 0;
  const customerNotificationCount =
    unreadCustomerMessageCount
    + customerServiceNotificationCount
    + customerStoreChatNotificationCount;
  const sellerNotificationCount =
    sellerNewOrderCount
    + sellerServiceNotificationCount
    + sellerStoreChatNotificationCount;
  const hasOrderNotification =
    activeOrderCount > 0
    || hasUnreadCustomerMessages
    || customerServiceNotificationCount > 0
    || customerStoreChatNotificationCount > 0;
  const hasSellerNotification = sellerNotificationCount > 0;
  const hasSellerOrderNotification = sellerNewOrderCount > 0;
  const hasSellerConversationNotification =
    sellerServiceNotificationCount > 0
    || sellerStoreChatNotificationCount > 0;

  const loadActiveOrders = useCallback(async () => {
    if (!session?.accessToken) {
      setActiveOrderCount(0);
      setUnreadCustomerMessageCount(0);
      return;
    }

    try {
      const response = await getCustomerOrders(session.accessToken);
      const orders = response.orders ?? [];

      setActiveOrderCount(orders.filter(isActiveOrder).length);
      setUnreadCustomerMessageCount(countUnreadCustomerMessages(orders));
    } catch {
      setActiveOrderCount(0);
      setUnreadCustomerMessageCount(0);
    }
  }, [session?.accessToken]);

  const loadSellerOrderNotifications = useCallback(async () => {
    if (!session?.accessToken) {
      setSellerNewOrderCount(0);
      setSellerStoreIds([]);
      return;
    }

    try {
      const response = await getSellerProfile(session.accessToken);
      const stores = response.stores ?? [];

      setSellerNewOrderCount(countSellerStoreNotifications(stores));
      setSellerStoreIds(stores.map((store) => store.id).filter(Boolean));
    } catch {
      setSellerNewOrderCount(0);
      setSellerStoreIds([]);
    }
  }, [session?.accessToken]);

  const loadServiceNotifications = useCallback(async () => {
    if (!session?.accessToken) {
      setSellerServiceNotificationCount(0);
      setCustomerServiceNotificationCount(0);
      return;
    }

    try {
      const [response, courierResponse] = await Promise.all([
        getServiceConversations(session.accessToken),
        getCourierRequests(session.accessToken),
      ]);
      const conversations = response.conversations ?? [];

      setSellerServiceNotificationCount(
        conversations.filter(
          (conversation) =>
            conversation.isSeller
            && (conversation.isNewForSeller || Number(conversation.unreadCount ?? 0) > 0),
        ).length + (courierResponse.requests ?? []).length,
      );
      setCustomerServiceNotificationCount(
        conversations.filter(
          (conversation) =>
            !conversation.isSeller && Number(conversation.unreadCount ?? 0) > 0,
        ).length,
      );
    } catch {
      setSellerServiceNotificationCount(0);
      setCustomerServiceNotificationCount(0);
    }
  }, [session?.accessToken]);

  const loadStoreChatNotifications = useCallback(async () => {
    if (!session?.accessToken) {
      setSellerStoreChatNotificationCount(0);
      setCustomerStoreChatNotificationCount(0);
      return;
    }

    try {
      const [customerResponse, sellerResponse] = await Promise.all([
        getStoreConversations(session.accessToken),
        getStoreConversations(session.accessToken, { scope: "seller" }),
      ]);

      setCustomerStoreChatNotificationCount(
        (customerResponse.conversations ?? []).reduce(
          (total, conversation) =>
            total + Number(conversation.unreadCount ?? 0),
          0,
        ),
      );
      setSellerStoreChatNotificationCount(
        (sellerResponse.conversations ?? []).reduce(
          (total, conversation) =>
            total + Number(conversation.unreadCount ?? 0),
          0,
        ),
      );
    } catch {
      setSellerStoreChatNotificationCount(0);
      setCustomerStoreChatNotificationCount(0);
    }
  }, [session?.accessToken]);

  const loadNotifications = useCallback(() => {
    loadActiveOrders();
    loadSellerOrderNotifications();
    loadServiceNotifications();
    loadStoreChatNotifications();
  }, [
    loadActiveOrders,
    loadSellerOrderNotifications,
    loadServiceNotifications,
    loadStoreChatNotifications,
  ]);

  useFocusEffect(useCallback(() => {
    loadNotifications();
  }, [loadNotifications]));

  const handleRealtimeOrder = useCallback(() => {
    loadNotifications();
  }, [loadNotifications]);

  useRealtimeOrders({
    accessToken: session?.accessToken,
    onMessageEvent: handleRealtimeOrder,
    onOrderEvent: handleRealtimeOrder,
    storeIds: sellerStoreIds,
  });

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshServices = () => loadServiceNotifications();

    socket?.on(realtimeEvents.serviceChatCreated, refreshServices);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refreshServices);
    socket?.on(realtimeEvents.serviceChatUpdated, refreshServices);
    socket?.on(realtimeEvents.courierRequestCreated, refreshServices);
    socket?.on(realtimeEvents.courierRequestUpdated, refreshServices);

    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refreshServices);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refreshServices);
      socket?.off(realtimeEvents.serviceChatUpdated, refreshServices);
      socket?.off(realtimeEvents.courierRequestCreated, refreshServices);
      socket?.off(realtimeEvents.courierRequestUpdated, refreshServices);
    };
  }, [loadServiceNotifications, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshStoreChats = () => loadStoreChatNotifications();

    socket?.on(realtimeEvents.storeChatCreated, refreshStoreChats);
    socket?.on(realtimeEvents.storeChatMessageCreated, refreshStoreChats);
    socket?.on(realtimeEvents.storeChatUpdated, refreshStoreChats);

    return () => {
      socket?.off(realtimeEvents.storeChatCreated, refreshStoreChats);
      socket?.off(realtimeEvents.storeChatMessageCreated, refreshStoreChats);
      socket?.off(realtimeEvents.storeChatUpdated, refreshStoreChats);
    };
  }, [loadStoreChatNotifications, session?.accessToken]);

  useEffect(
    () => subscribeStoreConversationRead(() => loadStoreChatNotifications()),
    [loadStoreChatNotifications],
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarBadge:
          route.name === "Vender" && hasSellerNotification
            ? sellerNotificationCount
            : route.name === "Perfil"
            ? hasOrderNotification
              ? customerNotificationCount
                ? customerNotificationCount
                : activeOrderCount
              : needsKycNotification
                ? ""
                : undefined
            : undefined,
        tabBarBadgeStyle: {
          backgroundColor:
            route.name === "Vender" && hasSellerNotification
              ? hasSellerOrderNotification
                ? colors.danger
                : hasSellerConversationNotification
                  ? colors.warning
                  : colors.info
              : hasCustomerCommunication
                ? colors.danger
                : hasOrderNotification
                ? colors.info
                : colors.warning,
          borderColor: colors.card,
          borderWidth: 2,
          color:
            route.name === "Vender"
            && !hasSellerOrderNotification
            && hasSellerConversationNotification
              ? "#4A2B00"
              : colors.card,
          fontFamily: fonts.bold,
          fontSize: 10,
          fontWeight: "700",
          height: route.name === "Perfil" && !hasOrderNotification && needsKycNotification ? 12 : 20,
          minWidth: route.name === "Perfil" && !hasOrderNotification && needsKycNotification ? 12 : 20,
          top: route.name === "Perfil" && !hasOrderNotification && needsKycNotification ? 7 : 1,
        },
        tabBarActiveTintColor: colors.primaryDark,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, focused, size }) => {
          const [activeIcon, inactiveIcon] = tabIcons[route.name];
          return (
            <View style={focused ? styles.activeIcon : styles.iconShell}>
              <Ionicons
                color={color}
                name={focused ? activeIcon : inactiveIcon}
                size={focused ? size - 1 : size}
              />
            </View>
          );
        },
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fonts.semiBold,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0,
        },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 8,
          paddingTop: 6,
        },
      })}
    >
      <Tab.Screen component={HomeScreen} name="Inicio" />
      <Tab.Screen component={StoresScreen} name="Buscar" />
      <Tab.Screen component={SellScreen} name="Vender" />
      <Tab.Screen component={NetworkScreen} name="Rede" />
      <Tab.Screen component={ProfileScreen} name="Perfil" />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  activeIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 30,
    justifyContent: "center",
    width: 44,
  },
  iconShell: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 44,
  },
});
