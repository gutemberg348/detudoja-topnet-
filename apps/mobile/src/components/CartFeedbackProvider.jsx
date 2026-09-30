import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { createCartFlightQueue } from "../utils/cart-feedback";
import { colors } from "../utils/theme";

const CartFeedbackContext = createContext(null);

// The overlay and the measured destination live outside scrolling/search content.
export function CartFeedbackProvider({ children }) {
  const hostRef = useRef(null);
  const targetRef = useRef(null);
  const queueRef = useRef(null);
  const [flights, setFlights] = useState([]);

  useEffect(() => {
    const queue = createCartFlightQueue({
      getTarget: () => targetRef.current,
      getHost: () => hostRef.current,
      onFlights: (next) => setFlights((current) => [...current, ...next].slice(-8)),
    });
    queueRef.current = queue;
    return () => { queue.dispose(); queueRef.current = null; };
  }, []);

  const flushFlights = useCallback(() => queueRef.current?.flush(), []);

  const setCartTarget = useCallback((node) => {
    targetRef.current = node;
    // Ref detach/attach must not discard queued or already-started flights.
    // In-flight dots clean themselves up; pending ones expire if the cart stays hidden.
    if (node) flushFlights();
  }, [flushFlights]);

  const animateToCart = useCallback((origin) => {
    // Search can keep the keyboard open; reveal the floating cart before measuring.
    Keyboard.dismiss();
    queueRef.current?.enqueue(origin);
  }, []);

  const finishFlight = useCallback((id) => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);
  const value = useMemo(() => ({ animateToCart, setCartTarget, onCartLayout: flushFlights }),
    [animateToCart, setCartTarget, flushFlights]);
  const overlay = (
    <View ref={hostRef} collapsable={false} onLayout={flushFlights}
      pointerEvents="none" accessible={false} style={styles.overlay}>
      {flights.map((flight) => <CartDot key={flight.id} flight={flight} onFinish={finishFlight} />)}
    </View>
  );

  return (
    <CartFeedbackContext.Provider value={value}>
      <View style={styles.host}>
        {children}
        {/* iOS native-stack screens can cover an ordinary JS sibling overlay. */}
        {Platform.OS === "ios" ? <FullWindowOverlay>{overlay}</FullWindowOverlay> : overlay}
      </View>
    </CartFeedbackContext.Provider>
  );
}

function CartDot({ flight, onFinish }) {
  const progress = useRef(new Animated.Value(0)).current;
  // A small arc stays visible even when the + button is next to the cart.
  const lift = Math.min(90, Math.max(42, Math.hypot(flight.deltaX, flight.deltaY) * 0.18));
  useEffect(() => {
    const animation = Animated.timing(progress, {
      duration: 700,
      easing: Easing.inOut(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished) onFinish(flight.id); });
    return () => animation.stop();
  }, [flight.id, onFinish, progress]);

  return (
    <Animated.View style={[styles.dot, {
      left: flight.startX,
      top: flight.startY,
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, flight.deltaX] }) },
        { translateY: progress.interpolate({
          inputRange: [0, 0.5, 1], outputRange: [0, flight.deltaY / 2 - lift, flight.deltaY],
        }) },
      ],
    }]} />
  );
}

export function useCartFeedback() {
  const context = useContext(CartFeedbackContext);
  if (!context) throw new Error("useCartFeedback must be used inside CartFeedbackProvider");
  return context;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 20 },
  dot: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderColor: colors.card,
    borderWidth: 2,
  },
});
