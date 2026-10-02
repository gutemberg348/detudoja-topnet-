import { useLiveRefresh } from "./useLiveRefresh";

export function useConversationRealtime({
  accessToken,
  conversationId,
  events = [],
  ignoreReasons = [],
  onUpdate,
}) {
  useLiveRefresh({
    accessToken,
    enabled: Boolean(conversationId),
    scopeKey: conversationId,
    events,
    acceptEvent: (payload) => Number(payload.conversationId) === Number(conversationId) && !ignoreReasons.includes(payload.reason),
    onRefresh: onUpdate,
  });
}
