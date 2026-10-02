import { useIsFocused } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getRealtimeSocket } from "../services/realtime";
import { createLiveRefresh } from "../utils/live-refresh";

export function useLiveRefresh({ accessToken, enabled = true, scopeKey = "", events = [], acceptEvent, onRefresh, intervalMs = 20000 }) {
  const focused = useIsFocused();
  const latest = useRef({ onRefresh, acceptEvent });
  latest.current = { onRefresh, acceptEvent };
  const eventsKey = events.join("|");

  useEffect(() => {
    if (!enabled || !focused || !accessToken) return undefined;
    const socket = getRealtimeSocket(accessToken);
    let active = AppState.currentState === "active";
    const queue = createLiveRefresh({
      refresh: () => latest.current.onRefresh?.(),
      isActive: () => active,
      reconnect: () => { if (socket && !socket.connected) socket.connect(); },
    });
    const onEvent = (payload = {}) => {
      if (!latest.current.acceptEvent || latest.current.acceptEvent(payload)) queue.request();
    };
    socket?.on("connect", queue.request);
    events.forEach((event) => socket?.on(event, onEvent));
    const subscription = AppState.addEventListener("change", (state) => {
      const wasActive = active;
      active = state === "active";
      if (active && !wasActive) queue.resume();
    });
    const timer = intervalMs > 0 ? setInterval(queue.resume, intervalMs) : null;
    queue.resume();
    return () => {
      active = false;
      queue.dispose();
      if (timer) clearInterval(timer);
      subscription.remove();
      socket?.off("connect", queue.request);
      events.forEach((event) => socket?.off(event, onEvent));
    };
  }, [accessToken, enabled, eventsKey, focused, intervalMs, scopeKey]);
}
