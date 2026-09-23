import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 84;

export function useChatTimeline({ latestMessageId, latestMessageIsMine, scrollRef }) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const atBottomRef = useRef(true);
  const contentHeightRef = useRef(0);
  const initializedRef = useRef(false);
  const layoutHeightRef = useRef(0);
  const previousLatestIdRef = useRef(latestMessageId ?? null);

  const scrollToLatest = useCallback((animated = true) => {
    atBottomRef.current = true;
    setIsAtBottom(true);
    setUnreadBelow(0);
    if (contentHeightRef.current <= layoutHeightRef.current + 8) return;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 20);
  }, [scrollRef]);

  const onScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nextAtBottom = distance <= BOTTOM_THRESHOLD;
    if (nextAtBottom !== atBottomRef.current) {
      atBottomRef.current = nextAtBottom;
      setIsAtBottom(nextAtBottom);
    }
    if (nextAtBottom) setUnreadBelow(0);
  }, []);

  const onContentSizeChange = useCallback((_width, height) => {
    contentHeightRef.current = height;
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
      && Math.abs(previousHeight - layoutHeightRef.current) > 24
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
    if (atBottomRef.current) scrollToLatest(true);
    else if (!latestMessageIsMine) setUnreadBelow((current) => current + 1);
  }, [latestMessageId, latestMessageIsMine, scrollToLatest]);

  return {
    isAtBottom,
    onContentSizeChange,
    onLayout,
    onScroll,
    scrollToLatest,
    unreadBelow,
  };
}
