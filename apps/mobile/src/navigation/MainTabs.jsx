import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Vibration, View } from "react-native";
import { HomeScreen } from "../app/HomeScreen";
import { NetworkScreen } from "../app/NetworkScreen";
import { ProfileScreen } from "../app/ProfileScreen";
import { SellScreen } from "../app/SellScreen";
import { StoresScreen } from "../app/StoresScreen";
import { IncomingServiceAlert } from "../components/IncomingServiceAlert";
import { countNewStoreOrders } from "../app/sell/seller.utils";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { getCustomerOrders } from "../services/orders.api";
import { acceptCourierRequest, getCourierRequests } from "../services/courier.api";
import { getSellerProfile } from "../services/seller.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { acceptServiceConversation, getServiceConversations } from "../services/service-chats.api";
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

export function MainTabs({ navigation }) {
  const { session } = useAuthStore();
  const alertTimerRef = useRef(null);
  const serviceNotificationRequestRef = useRef(null);
  const serviceRefreshTimerRef = useRef(null);
  const [incomingServiceAlert, setIncomingServiceAlert] = useState(null);
  const [incomingAlertLoading, setIncomingAlertLoading] = useState(false);
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

  const showIncomingServiceAlert = useCallback((alert) => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setIncomingServiceAlert(alert);
    alertTimerRef.current = setTimeout(() => {
      setIncomingServiceAlert(null);
      alertTimerRef.current = null;
    }, 12000);
  }, []);

  const closeIncomingServiceAlert = useCallback(() => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = null;
    setIncomingServiceAlert(null);
  }, []);

  useEffect(() => () => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    if (serviceRefreshTimerRef.current) clearTimeout(serviceRefreshTimerRef.current);
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
    const refreshServices = () => scheduleServiceNotificationLoad();
    const notifyCourierRequest = ({ request } = {}) => {
      if (Platform.OS !== "web") Vibration.vibrate([0, 180, 100, 240]);
      if (request?.status === "PENDENTE") {
        showIncomingServiceAlert({
          id: request.id,
          kind: "courier",
          subtitle: request.type === "EQUIPE"
            ? "Chamada direta de uma loja da sua equipe. Aceite para abrir o chat."
            : "Uma entrega da sua cidade esta aguardando o primeiro aceite.",
          title: request.store?.name ?? "Cliente solicitando entrega",
        });
      }
      scheduleServiceNotificationLoad();
    };
    const notifyServiceChat = ({ conversation } = {}) => {
      const isSellerTarget = Number(conversation?.seller?.userId) === Number(session.user?.id);
      if (isSellerTarget && conversation?.status === "ABERTA") {
        if (Platform.OS !== "web") Vibration.vibrate([0, 140, 80, 180]);
        showIncomingServiceAlert({
          id: conversation.id,
          kind: "service",
          subtitle: "Confira os detalhes e aceite para liberar a negociacao no chat.",
          title: conversation.serviceType?.name ?? conversation.segment?.name ?? "Novo servico",
        });
      }
      scheduleServiceNotificationLoad();
    };

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
  }, [scheduleServiceNotificationLoad, session?.accessToken, session?.user?.id, showIncomingServiceAlert]);

  const acceptIncomingAlert = useCallback(async () => {
    if (!incomingServiceAlert || !session?.accessToken || incomingAlertLoading) return;
    setIncomingAlertLoading(true);

    try {
      const response = incomingServiceAlert.kind === "courier"
        ? await acceptCourierRequest(session.accessToken, incomingServiceAlert.id)
        : await acceptServiceConversation(session.accessToken, incomingServiceAlert.id);
      closeIncomingServiceAlert();
      if (response?.conversation) {
        navigation.navigate("ServiceConversation", { conversation: response.conversation });
      } else {
        navigation.navigate("ServiceDesk");
      }
      scheduleServiceNotificationLoad();
    } catch {
      closeIncomingServiceAlert();
      navigation.navigate("ServiceDesk");
      scheduleServiceNotificationLoad();
    } finally {
      setIncomingAlertLoading(false);
    }
  }, [
    closeIncomingServiceAlert,
    incomingAlertLoading,
    incomingServiceAlert,
    navigation,
    scheduleServiceNotificationLoad,
    session?.accessToken,
  ]);

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
      <IncomingServiceAlert
        alert={incomingServiceAlert}
        loading={incomingAlertLoading}
        onAccept={acceptIncomingAlert}
        onClose={closeIncomingServiceAlert}
        onPress={() => {
          closeIncomingServiceAlert();
          navigation.navigate("ServiceDesk");
        }}
      />
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
