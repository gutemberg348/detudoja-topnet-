import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCustomerOrders } from "../../services/orders.api";
import { getPersonalChats } from "../../services/personal-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../../services/realtime";
import { getSellerServices, getServiceConversations, heartbeatSellerServices } from "../../services/service-chats.api";
import { getStoreConversations } from "../../services/store-chats.api";

function serializeOrderConversation(order) {
  return {
    date: order.updatedAt ?? order.createdAt,
    id: `order-${order.id}`,
    kind: "order",
    order,
    title: order.store?.name ?? "Loja",
    unreadCount: Number(order.unreadCustomerMessages ?? order.unreadMessagesCount ?? 0),
  };
}

function serializeStoreConversation(conversation) {
  return {
    conversation,
    date: conversation.updatedAt ?? conversation.createdAt,
    id: `store-${conversation.id}`,
    kind: "store",
    title: conversation.store?.name ?? "Loja",
    unreadCount: Number(conversation.unreadCount ?? 0),
  };
}

function serializePersonalConversation(conversation) {
  return {
    conversation,
    date: conversation.updatedAt ?? conversation.createdAt,
    id: `person-${conversation.id}`,
    kind: "person",
    title: conversation.displayName,
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

  const conversations = useMemo(
    () => [
      ...orders.map(serializeOrderConversation),
      ...personalChats.map(serializePersonalConversation),
      ...storeConversations.map(serializeStoreConversation),
    ]
      .sort((first, second) => new Date(second.date ?? 0) - new Date(first.date ?? 0))
      .slice(0, 3),
    [orders, personalChats, storeConversations],
  );

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

  return { conversations, courierConversations, courierOnline, isLoading, personalUnreadCount };
}
