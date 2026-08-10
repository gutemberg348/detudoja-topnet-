import { useEffect } from "react";
import { getRealtimeSocket } from "../services/realtime";

export function useConversationRealtime({
  accessToken,
  conversationId,
  events = [],
  ignoreReasons = [],
  onUpdate,
}) {
  const eventsKey = events.join("|");
  const ignoredReasonsKey = ignoreReasons.join("|");

  useEffect(() => {
    if (!accessToken || !conversationId || !events.length) return undefined;

    const socket = getRealtimeSocket(accessToken);
    if (!socket) return undefined;

    const ignoredReasons = new Set(ignoreReasons);
    const handleUpdate = (payload = {}) => {
      if (Number(payload.conversationId) !== Number(conversationId)) return;
      if (ignoredReasons.has(payload.reason)) return;
      onUpdate?.(payload);
    };

    events.forEach((eventName) => socket.on(eventName, handleUpdate));

    return () => {
      events.forEach((eventName) => socket.off(eventName, handleUpdate));
    };
  }, [accessToken, conversationId, eventsKey, ignoredReasonsKey, onUpdate]);
}
