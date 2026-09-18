import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 84;

export function useChatTimeline({ itemCount, scrollRef }) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const atBottomRef = useRef(true);
  const contentHeightRef = useRef(0);
  const initializedRef = useRef(false);
  const layoutHeightRef = useRef(0);
  const previousCountRef = useRef(itemCount ?? 0);

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
    layoutHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  useEffect(() => {
    const currentCount = itemCount ?? 0;
    const added = Math.max(0, currentCount - previousCountRef.current);
    previousCountRef.current = currentCount;

    if (!initializedRef.current && currentCount > 0) {
      initializedRef.current = true;
      scrollToLatest(false);
      return;
    }
    if (!added) return;
    if (atBottomRef.current) scrollToLatest(true);
    else setUnreadBelow((current) => current + added);
  }, [itemCount, scrollToLatest]);

  return {
    isAtBottom,
    onContentSizeChange,
    onLayout,
    onScroll,
    scrollToLatest,
    unreadBelow,
  };
}
