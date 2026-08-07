import { useEffect } from "react";
import {
  getRealtimeSocket,
  realtimeEvents,
} from "../services/realtime";

export function useRealtimeOrders({
  accessToken,
  active = true,
  onMessageEvent,
  onOrderEvent,
  onStoreEvent,
  orderId,
  storeId,
  storeIds = [],
}) {
  const storeIdsKey = (storeIds ?? []).filter(Boolean).join("|");

  useEffect(() => {
    if (!active || !accessToken) {
      return undefined;
    }

    const socket = getRealtimeSocket(accessToken);

    if (!socket) {
      return undefined;
    }

    function handleOrderEvent(payload = {}) {
      if (orderId && payload.orderId !== orderId) {
        return;
      }

      if (storeId && payload.storeId !== storeId) {
        return;
      }

      onOrderEvent?.(payload);
      onStoreEvent?.(payload);
    }

    function handleStoreEvent(payload = {}) {
      if (orderId && payload.orderId !== orderId) {
        return;
      }

      if (storeId && payload.storeId !== storeId) {
        return;
      }

      onOrderEvent?.(payload);
      onStoreEvent?.(payload);
    }

    function handleMessageEvent(payload = {}) {
      if (orderId && payload.orderId !== orderId) {
        return;
      }

      if (storeId && payload.storeId !== storeId) {
        return;
      }

      onMessageEvent?.(payload);
      onStoreEvent?.(payload);
    }

    const joinedStoreIds = new Set([
      ...(storeId ? [storeId] : []),
      ...storeIdsKey.split("|").filter(Boolean),
    ]);

    for (const joinedStoreId of joinedStoreIds) {
      socket.emit("store:join", { storeId: joinedStoreId });
    }

    if (orderId) {
      socket.emit("order:join", { orderId, storeId });
    }

    socket.on(realtimeEvents.orderCreated, handleStoreEvent);
    socket.on(realtimeEvents.orderStatusUpdated, handleOrderEvent);
    socket.on(realtimeEvents.orderMessageCreated, handleMessageEvent);

    return () => {
      socket.off(realtimeEvents.orderCreated, handleStoreEvent);
      socket.off(realtimeEvents.orderStatusUpdated, handleOrderEvent);
      socket.off(realtimeEvents.orderMessageCreated, handleMessageEvent);

      if (orderId) {
        socket.emit("order:leave", { orderId });
      }

      for (const joinedStoreId of joinedStoreIds) {
        socket.emit("store:leave", { storeId: joinedStoreId });
      }
    };
  }, [
    accessToken,
    active,
    onMessageEvent,
    onOrderEvent,
    onStoreEvent,
    orderId,
    storeId,
    storeIdsKey,
  ]);
}
