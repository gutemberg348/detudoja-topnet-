import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

const BOTTOM_THRESHOLD = 84;

export function useChatTimeline({ latestMessageId, latestMessageIsMine, scrollRef }) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const atBottomRef = useRef(true);
  const followingLatestRef = useRef(false);
  const keyboardTransitionRef = useRef(false);
  const initializedRef = useRef(false);
  const layoutHeightRef = useRef(0);
  const previousLatestIdRef = useRef(latestMessageId ?? null);
  const scrollTimerRef = useRef(null);
  const smoothScrollRef = useRef(false);

  useEffect(() => () => clearTimeout(scrollTimerRef.current), []);

  const scrollToLatest = useCallback((animated = true) => {
    atBottomRef.current = true;
    followingLatestRef.current = true;
    setIsAtBottom(true);
    setUnreadBelow(0);
    clearTimeout(scrollTimerRef.current);
    // This callback is also passed directly to Pressable, which supplies an event.
    smoothScrollRef.current = smoothScrollRef.current || animated !== false;
    scrollTimerRef.current = setTimeout(() => {
      // Even a short conversation can have a stale native offset after an iOS
      // keyboard resize. Let the native list clamp it back to its actual end.
      scrollRef.current?.scrollToEnd({ animated: smoothScrollRef.current });
      smoothScrollRef.current = false;
      scrollTimerRef.current = null;
    }, 20);
  }, [scrollRef]);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    const willChange = Keyboard.addListener("keyboardWillChangeFrame", () => {
      keyboardTransitionRef.current = atBottomRef.current;
    });
    const didChange = Keyboard.addListener("keyboardDidChangeFrame", () => {
      const shouldFollow = keyboardTransitionRef.current;
      keyboardTransitionRef.current = false;
      if (shouldFollow) scrollToLatest(false);
    });
    return () => {
      willChange.remove();
      didChange.remove();
    };
  }, [scrollToLatest]);

  const onScrollBeginDrag = useCallback(() => {
    // An intentional gesture takes precedence over automatic positioning.
    followingLatestRef.current = false;
    keyboardTransitionRef.current = false;
    clearTimeout(scrollTimerRef.current);
    smoothScrollRef.current = false;
  }, []);

  const onScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nextAtBottom = distance <= BOTTOM_THRESHOLD;
    // Layout/animation events are not evidence that the user scrolled away.
    if (keyboardTransitionRef.current || (followingLatestRef.current && !nextAtBottom)) return;
    followingLatestRef.current = false;
    if (nextAtBottom !== atBottomRef.current) {
      atBottomRef.current = nextAtBottom;
      setIsAtBottom(nextAtBottom);
    }
    if (nextAtBottom) setUnreadBelow(0);
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (!initializedRef.current || atBottomRef.current) {
      initializedRef.current = true;
      scrollToLatest(false);
    }
  }, [scrollToLatest]);

  const onLayout = useCallback((event) => {
    const previousHeight = layoutHeightRef.current;
    layoutHeightRef.current = event.nativeEvent.layout.height;
    if (
      previousHeight > 0
      && Math.abs(previousHeight - layoutHeightRef.current) > 1
      && atBottomRef.current
    ) {
      scrollToLatest(false);
    }
  }, [scrollToLatest]);

  useEffect(() => {
    const previousLatestId = previousLatestIdRef.current;
    previousLatestIdRef.current = latestMessageId ?? null;
    if (!initializedRef.current && latestMessageId) {
      initializedRef.current = true;
      scrollToLatest(false);
      return;
    }
    if (!latestMessageId || latestMessageId === previousLatestId) return;
    if (atBottomRef.current || latestMessageIsMine) scrollToLatest(true);
    else if (!latestMessageIsMine) setUnreadBelow((current) => current + 1);
  }, [latestMessageId, latestMessageIsMine, scrollToLatest]);

  return {
    isAtBottom,
    onContentSizeChange,
    onLayout,
    onScroll,
    onScrollBeginDrag,
    scrollToLatest,
    unreadBelow,
  };
}
