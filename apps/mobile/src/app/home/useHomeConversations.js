import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCustomerOrders } from "../../services/orders.api";
import { getPersonalChats } from "../../services/personal-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../../services/realtime";
import { getSellerServices, getServiceConversations, heartbeatSellerServices } from "../../services/service-chats.api";
import { getStoreConversations } from "../../services/store-chats.api";
import { chatMessagePreview } from "../../utils/chat-preview";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";

const finalOrderStatuses = new Set(["CANCELADO", "CONCLUIDO"]);

function serializeOrderConversation(order) {
  return {
    date: order.updatedAt ?? order.createdAt,
    id: `order-${order.id}`,
    imageUrl: order.store?.logoUrl ?? null,
    kind: "store-order",
    order,
    subtitle: `Pedido ${order.code ?? order.id}`,
    title: order.store?.name ?? "Loja",
    unreadCount: Number(order.unreadCustomerMessages ?? order.unreadMessagesCount ?? 0),
  };
}

function serializeStoreConversation(conversation, order = null) {
  const orderDate = order?.updatedAt ?? order?.createdAt;
  const conversationDate = conversation.updatedAt ?? conversation.createdAt;

  return {
    conversation,
    date: new Date(orderDate ?? 0) > new Date(conversationDate ?? 0)
      ? orderDate
      : conversationDate,
    id: `store-${conversation.id}`,
    imageUrl: conversation.store?.logoUrl ?? conversation.otherPerson?.photoUrl ?? null,
    kind: order ? "store-order" : "store",
    order,
    subtitle: order
      ? `Pedido ${order.code ?? order.id} - ${order.status ?? "em acompanhamento"}`
      : chatMessagePreview(conversation.lastMessage, "Conversa com a loja"),
    title: conversation.store?.name ?? "Loja",
    unreadCount: Number(conversation.unreadCount ?? 0)
      + Number(order?.unreadCustomerMessages ?? order?.unreadMessagesCount ?? 0),
  };
}

function serializePersonalConversation(conversation) {
  return {
    conversation,
    date: conversation.updatedAt ?? conversation.createdAt,
    id: `person-${conversation.id}`,
    imageUrl: conversation.person?.photoUrl ?? null,
    kind: "person",
    subtitle: chatMessagePreview(conversation.lastMessage, `@${conversation.person?.publicId ?? "contato"}`),
    title: conversation.displayName,
    unreadCount: Number(conversation.unreadCount ?? 0),
  };
}

function serializeServiceConversation(conversation) {
  const requestedStore = conversation.request?.store;
  return {
    conversation,
    date: conversation.updatedAt ?? conversation.createdAt,
    id: `service-${conversation.id}`,
    imageUrl: requestedStore?.logoUrl ?? conversation.otherPerson?.photoUrl ?? null,
    kind: "service",
    subtitle: chatMessagePreview(conversation.lastMessage, conversation.request?.description
      ?? conversation.serviceType?.name
      ?? "Conversa de servico"),
    title: requestedStore?.name
      ?? conversation.otherPerson?.name
      ?? conversation.serviceType?.name
      ?? "Servico",
    unreadCount: Number(conversation.unreadCount ?? 0),
  };
}

export function useHomeConversations(accessToken) {
  const isFocused = useIsFocused();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [personalChats, setPersonalChats] = useState([]);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [sellerServices, setSellerServices] = useState([]);
  const [serviceConversations, setServiceConversations] = useState([]);
  const [storeConversations, setStoreConversations] = useState([]);
  const requestIdRef = useRef(0);
  const sellerRequestIdRef = useRef(0);
  const refreshTimerRef = useRef(null);

  const loadSellerServices = useCallback(() => {
    if (!accessToken) return;
    const requestId = ++sellerRequestIdRef.current;
    void getSellerServices(accessToken).then((response) => {
      if (requestId === sellerRequestIdRef.current) setSellerServices(response.services ?? []);
    }).catch(() => {});
  }, [accessToken]);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    if (!accessToken) {
      setOrders([]);
      setPersonalChats([]);
      setPendingFriendRequests(0);
      setSellerServices([]);
      setServiceConversations([]);
      setStoreConversations([]);
      setIsLoading(false);
      return;
    }

    let pendingConversations = 4;
    const finish = () => {
      pendingConversations -= 1;
      if (requestId === requestIdRef.current && pendingConversations === 0) setIsLoading(false);
    };
    const receive = (promise, apply, hasConversations) => {
      void promise.then((response) => {
        if (requestId !== requestIdRef.current) return;
        apply(response);
        if (hasConversations(response)) setIsLoading(false);
      }).catch(() => {
        // Mantem as conversas ja exibidas se uma fonte falhar.
      }).finally(finish);
    };

    receive(getCustomerOrders(accessToken), (response) => setOrders(response.orders ?? []),
      (response) => (response.orders ?? []).length > 0);
    receive(getStoreConversations(accessToken), (response) => setStoreConversations(response.conversations ?? []),
      (response) => (response.conversations ?? []).length > 0);
    receive(getPersonalChats(accessToken), (response) => {
      setPersonalChats(response.conversations ?? []);
      setPendingFriendRequests((response.requests ?? []).filter(
        (request) => request.invitationDirection === "incoming",
      ).length);
    }, (response) => (response.conversations ?? []).length > 0);
    receive(getServiceConversations(accessToken), (response) => setServiceConversations(response.conversations ?? []),
      (response) => (response.conversations ?? []).length > 0);
  }, [accessToken]);

  useFocusEffect(useCallback(() => {
    load();
    loadSellerServices();
    if (accessToken) void heartbeatSellerServices(accessToken).catch(() => {});
    return () => {
      requestIdRef.current += 1;
      sellerRequestIdRef.current += 1;
    };
  }, [accessToken, load, loadSellerServices]));

  useLiveRefresh({ accessToken, intervalMs: 0, refreshOnFocus: false,
    onRefresh: () => { load(); loadSellerServices(); } });

  useEffect(() => {
    if (!accessToken || !isFocused) {
      return undefined;
    }

    const socket = getRealtimeSocket(accessToken);
    const scheduleLoad = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        load();
      }, 180);
    };

    socket?.on(realtimeEvents.orderCreated, scheduleLoad);
    socket?.on(realtimeEvents.orderMessageCreated, scheduleLoad);
    socket?.on(realtimeEvents.orderStatusUpdated, scheduleLoad);
    socket?.on(realtimeEvents.personalChatCreated, scheduleLoad);
    socket?.on(realtimeEvents.personalChatMessageCreated, scheduleLoad);
    socket?.on(realtimeEvents.personalChatUpdated, scheduleLoad);
    socket?.on(realtimeEvents.storeChatCreated, scheduleLoad);
    socket?.on(realtimeEvents.storeChatMessageCreated, scheduleLoad);
    socket?.on(realtimeEvents.storeChatUpdated, scheduleLoad);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, loadSellerServices);
    socket?.on(realtimeEvents.serviceChatCreated, scheduleLoad);
    socket?.on(realtimeEvents.serviceChatMessageCreated, scheduleLoad);
    socket?.on(realtimeEvents.serviceChatUpdated, scheduleLoad);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      socket?.off(realtimeEvents.orderCreated, scheduleLoad);
      socket?.off(realtimeEvents.orderMessageCreated, scheduleLoad);
      socket?.off(realtimeEvents.orderStatusUpdated, scheduleLoad);
      socket?.off(realtimeEvents.personalChatCreated, scheduleLoad);
      socket?.off(realtimeEvents.personalChatMessageCreated, scheduleLoad);
      socket?.off(realtimeEvents.personalChatUpdated, scheduleLoad);
      socket?.off(realtimeEvents.storeChatCreated, scheduleLoad);
      socket?.off(realtimeEvents.storeChatMessageCreated, scheduleLoad);
      socket?.off(realtimeEvents.storeChatUpdated, scheduleLoad);
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, loadSellerServices);
      socket?.off(realtimeEvents.serviceChatCreated, scheduleLoad);
      socket?.off(realtimeEvents.serviceChatMessageCreated, scheduleLoad);
      socket?.off(realtimeEvents.serviceChatUpdated, scheduleLoad);
    };
  }, [accessToken, isFocused, load, loadSellerServices]);

  const searchableConversations = useMemo(() => {
    const latestOrderByStore = new Map();

    orders.forEach((order) => {
      if (finalOrderStatuses.has(order.status)) return;

      const storeId = Number(order.storeId ?? order.store?.id);
      if (!storeId) return;

      const current = latestOrderByStore.get(storeId);
      const currentDate = current?.updatedAt ?? current?.createdAt ?? 0;
      const orderDate = order.updatedAt ?? order.createdAt ?? 0;
      if (!current || new Date(orderDate) > new Date(currentDate)) {
        latestOrderByStore.set(storeId, order);
      }
    });

    const representedStores = new Set();
    const stores = storeConversations.map((conversation) => {
      const storeId = Number(conversation.store?.id);
      if (storeId) representedStores.add(storeId);
      return serializeStoreConversation(conversation, latestOrderByStore.get(storeId) ?? null);
    });
    const ordersWithoutConversation = [...latestOrderByStore.entries()]
      .filter(([storeId]) => !representedStores.has(storeId))
      .map(([, order]) => serializeOrderConversation(order));

    return [
      ...ordersWithoutConversation,
      ...personalChats.map(serializePersonalConversation),
      ...stores,
      ...serviceConversations.map(serializeServiceConversation),
    ].sort((first, second) => new Date(second.date ?? 0) - new Date(first.date ?? 0));
  }, [orders, personalChats, serviceConversations, storeConversations]);
  // A Home e a lista principal de conversas. Nao limitamos a tres itens:
  // o ScreenContainer ja oferece rolagem e assim nenhuma conversa ativa fica
  // escondida ate a pessoa abrir outra tela.
  const conversations = searchableConversations;

  const personalUnreadCount = personalChats.reduce(
    (total, conversation) => total + Number(conversation.unreadCount ?? 0),
    pendingFriendRequests,
  );

  const courierOnline = sellerServices.some((service) => (
    service.available
    && (service.requiresCourierProfile || service.operationalType === "ENTREGA_LOCAL")
  ));
  const courierConversations = serviceConversations
    .filter((conversation) => (
      conversation.isSeller
      && conversation.serviceType?.operationalType === "ENTREGA_LOCAL"
    ))
    .sort((first, second) => new Date(second.updatedAt ?? 0) - new Date(first.updatedAt ?? 0));

  return {
    conversations,
    courierConversations,
    courierOnline,
    isLoading,
    personalUnreadCount,
    searchableConversations,
  };
}
