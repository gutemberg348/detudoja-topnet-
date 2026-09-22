import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCustomerOrders } from "../../services/orders.api";
import { getPersonalChats } from "../../services/personal-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../../services/realtime";
import { getSellerServices, getServiceConversations, heartbeatSellerServices } from "../../services/service-chats.api";
import { getStoreConversations } from "../../services/store-chats.api";

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
      : conversation.lastMessage?.text ?? "Conversa com a loja",
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
    subtitle: conversation.lastMessage?.text ?? `@${conversation.person?.publicId ?? "contato"}`,
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
    subtitle: conversation.lastMessage?.text
      ?? conversation.request?.description
      ?? conversation.serviceType?.name
      ?? "Conversa de servico",
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

  const load = useCallback(async () => {
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

    await heartbeatSellerServices(accessToken).catch(() => {});
    const [ordersResult, storesResult, personalResult, servicesResult, serviceConversationsResult] = await Promise.allSettled([
      getCustomerOrders(accessToken),
      getStoreConversations(accessToken),
      getPersonalChats(accessToken),
      getSellerServices(accessToken),
      getServiceConversations(accessToken),
    ]);

    if (ordersResult.status === "fulfilled") {
      setOrders(ordersResult.value.orders ?? []);
    }

    if (storesResult.status === "fulfilled") {
      setStoreConversations(storesResult.value.conversations ?? []);
    }

    if (personalResult.status === "fulfilled") {
      setPersonalChats(personalResult.value.conversations ?? []);
      setPendingFriendRequests(
        (personalResult.value.requests ?? []).filter(
          (request) => request.invitationDirection === "incoming",
        ).length,
      );
    }

    if (servicesResult.status === "fulfilled") {
      setSellerServices(servicesResult.value.services ?? []);
    }

    if (serviceConversationsResult.status === "fulfilled") {
      setServiceConversations(serviceConversationsResult.value.conversations ?? []);
    }

    setIsLoading(false);
  }, [accessToken]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  useEffect(() => {
    if (!accessToken || !isFocused) {
      return undefined;
    }

    const socket = getRealtimeSocket(accessToken);

    socket?.on(realtimeEvents.orderCreated, load);
    socket?.on(realtimeEvents.orderMessageCreated, load);
    socket?.on(realtimeEvents.orderStatusUpdated, load);
    socket?.on(realtimeEvents.personalChatCreated, load);
    socket?.on(realtimeEvents.personalChatMessageCreated, load);
    socket?.on(realtimeEvents.personalChatUpdated, load);
    socket?.on(realtimeEvents.storeChatCreated, load);
    socket?.on(realtimeEvents.storeChatMessageCreated, load);
    socket?.on(realtimeEvents.storeChatUpdated, load);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, load);
    socket?.on(realtimeEvents.serviceChatCreated, load);
    socket?.on(realtimeEvents.serviceChatMessageCreated, load);
    socket?.on(realtimeEvents.serviceChatUpdated, load);

    return () => {
      socket?.off(realtimeEvents.orderCreated, load);
      socket?.off(realtimeEvents.orderMessageCreated, load);
      socket?.off(realtimeEvents.orderStatusUpdated, load);
      socket?.off(realtimeEvents.personalChatCreated, load);
      socket?.off(realtimeEvents.personalChatMessageCreated, load);
      socket?.off(realtimeEvents.personalChatUpdated, load);
      socket?.off(realtimeEvents.storeChatCreated, load);
      socket?.off(realtimeEvents.storeChatMessageCreated, load);
      socket?.off(realtimeEvents.storeChatUpdated, load);
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, load);
      socket?.off(realtimeEvents.serviceChatCreated, load);
      socket?.off(realtimeEvents.serviceChatMessageCreated, load);
      socket?.off(realtimeEvents.serviceChatUpdated, load);
    };
  }, [accessToken, isFocused, load]);

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
