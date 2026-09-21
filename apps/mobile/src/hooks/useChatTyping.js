import { useCallback, useEffect, useRef, useState } from "react";

export function useChatTyping({ conversationId, draft, sendTyping }) {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const sentRef = useRef(false);
  const localTimerRef = useRef(null);
  const remoteTimerRef = useRef(null);
  const sendTypingRef = useRef(sendTyping);
  sendTypingRef.current = sendTyping;

  const publish = useCallback((value) => {
    if (!conversationId || sentRef.current === value) return;
    sentRef.current = value;
    void sendTypingRef.current?.(value)?.catch?.(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    if (String(draft ?? "").trim()) {
      publish(true);
      localTimerRef.current = setTimeout(() => publish(false), 1600);
    } else {
      publish(false);
    }
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
    };
  }, [draft, publish]);

  useEffect(() => () => {
    if (sentRef.current) void sendTypingRef.current?.(false)?.catch?.(() => {});
    if (remoteTimerRef.current) clearTimeout(remoteTimerRef.current);
  }, []);

  const receiveTyping = useCallback((payload) => {
    if (Number(payload?.conversationId) !== Number(conversationId)) return;
    if (remoteTimerRef.current) clearTimeout(remoteTimerRef.current);
    setIsOtherTyping(Boolean(payload.isTyping));
    if (payload.isTyping) {
      remoteTimerRef.current = setTimeout(() => setIsOtherTyping(false), 3500);
    }
  }, [conversationId]);

  return { isOtherTyping, receiveTyping };
}
