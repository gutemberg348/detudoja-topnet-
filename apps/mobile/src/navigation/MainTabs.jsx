import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { getServiceConversations, heartbeatSellerServices } from "../services/service-chats.api";
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
const activeServiceConversationStatuses = new Set([
  "ABERTA",
  "ACORDADA",
  "AGUARDANDO_CONFIRMACAO",
]);

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
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const serviceNotificationRequestRef = useRef(null);
  const serviceRefreshTimerRef = useRef(null);
  const storeNotificationRequestRef = useRef(null);
  const storeRefreshTimerRef = useRef(null);
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

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const heartbeat = () => heartbeatSellerServices(session.accessToken).catch(() => {});
    heartbeat();
    const timer = setInterval(heartbeat, 45_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") heartbeat();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [session?.accessToken]);

  useEffect(() => () => {
    if (serviceRefreshTimerRef.current) clearTimeout(serviceRefreshTimerRef.current);
    if (storeRefreshTimerRef.current) clearTimeout(storeRefreshTimerRef.current);
  }, []);

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

    if (serviceNotificationRequestRef.current) {
      return serviceNotificationRequestRef.current;
    }

    const request = (async () => {
      try {
        const [response, courierResponse] = await Promise.all([
          getServiceConversations(session.accessToken),
          getCourierRequests(session.accessToken),
        ]);
        const conversations = response.conversations ?? [];
        const pendingCourierRequests = (courierResponse.requests ?? []).filter((requestItem) => (
          requestItem.status === "PENDENTE"
          && new Date(requestItem.expiresAt).getTime() > Date.now()
        ));

        setSellerServiceNotificationCount(
          conversations.filter(
            (conversation) =>
              conversation.isSeller
              && activeServiceConversationStatuses.has(conversation.status)
              && (conversation.isNewForSeller || Number(conversation.unreadCount ?? 0) > 0),
          ).length + pendingCourierRequests.length,
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
    })();
    serviceNotificationRequestRef.current = request;

    try {
      return await request;
    } finally {
      if (serviceNotificationRequestRef.current === request) {
        serviceNotificationRequestRef.current = null;
      }
    }
  }, [session?.accessToken]);

  const scheduleServiceNotificationLoad = useCallback(() => {
    if (serviceRefreshTimerRef.current) clearTimeout(serviceRefreshTimerRef.current);
    serviceRefreshTimerRef.current = setTimeout(() => {
      serviceRefreshTimerRef.current = null;
      loadServiceNotifications();
    }, 250);
  }, [loadServiceNotifications]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    loadServiceNotifications();
    const timer = setInterval(loadServiceNotifications, 30_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") loadServiceNotifications();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [loadServiceNotifications, session?.accessToken]);

  const loadStoreChatNotifications = useCallback(async () => {
    if (!session?.accessToken) {
      setSellerStoreChatNotificationCount(0);
      setCustomerStoreChatNotificationCount(0);
      return;
    }

    if (storeNotificationRequestRef.current) {
      return storeNotificationRequestRef.current;
    }

    const request = (async () => {
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
    })();
    storeNotificationRequestRef.current = request;

    try {
      return await request;
    } finally {
      if (storeNotificationRequestRef.current === request) {
        storeNotificationRequestRef.current = null;
      }
    }
  }, [session?.accessToken]);

  const scheduleStoreChatNotificationLoad = useCallback(() => {
    if (storeRefreshTimerRef.current) clearTimeout(storeRefreshTimerRef.current);
    storeRefreshTimerRef.current = setTimeout(() => {
      storeRefreshTimerRef.current = null;
      loadStoreChatNotifications();
    }, 250);
  }, [loadStoreChatNotifications]);

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
    const refreshServices = () => scheduleServiceNotificationLoad();
    const notifyCourierRequest = () => scheduleServiceNotificationLoad();
    const notifyServiceChat = () => scheduleServiceNotificationLoad();

    socket?.on(realtimeEvents.serviceChatCreated, notifyServiceChat);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refreshServices);
    socket?.on(realtimeEvents.serviceChatUpdated, refreshServices);
    socket?.on(realtimeEvents.courierRequestCreated, notifyCourierRequest);
    socket?.on(realtimeEvents.courierRequestUpdated, refreshServices);

    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, notifyServiceChat);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refreshServices);
      socket?.off(realtimeEvents.serviceChatUpdated, refreshServices);
      socket?.off(realtimeEvents.courierRequestCreated, notifyCourierRequest);
      socket?.off(realtimeEvents.courierRequestUpdated, refreshServices);
    };
  }, [scheduleServiceNotificationLoad, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken || !isFocused) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshStoreChats = (payload = {}) => {
      if (payload.reason === "customer-journey") return;
      if (payload.message) {
        const isSellerReply = payload.message.author === "store";
        const isSupportRequest = payload.message.content?.kind === "SUPPORT";
        if (!isSellerReply && !isSupportRequest) return;
      }
      scheduleStoreChatNotificationLoad();
    };

    socket?.on(realtimeEvents.storeChatCreated, refreshStoreChats);
    socket?.on(realtimeEvents.storeChatMessageCreated, refreshStoreChats);
    socket?.on(realtimeEvents.storeChatUpdated, refreshStoreChats);

    return () => {
      socket?.off(realtimeEvents.storeChatCreated, refreshStoreChats);
      socket?.off(realtimeEvents.storeChatMessageCreated, refreshStoreChats);
      socket?.off(realtimeEvents.storeChatUpdated, refreshStoreChats);
    };
  }, [isFocused, scheduleStoreChatNotificationLoad, session?.accessToken]);

  useEffect(
    () => subscribeStoreConversationRead(() => {
      if (isFocused) scheduleStoreChatNotificationLoad();
    }),
    [isFocused, scheduleStoreChatNotificationLoad],
  );

  return (
    <View style={styles.root}>
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
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
      })}
    >
      <Tab.Screen component={HomeScreen} name="Inicio" />
      <Tab.Screen component={StoresScreen} name="Buscar" />
      <Tab.Screen component={SellScreen} name="Vender" options={{ tabBarLabel: "Vendas" }} />
      <Tab.Screen component={NetworkScreen} name="Rede" />
      <Tab.Screen component={ProfileScreen} name="Perfil" />
      </Tab.Navigator>
    </View>
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
  root: {
    flex: 1,
  },
});
