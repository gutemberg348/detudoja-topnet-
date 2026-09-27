import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function ChatTypingIndicator({ visible }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    progress.setValue(0);
    if (!visible || reducedMotion) return undefined;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
      isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion, visible]);

  if (!visible) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.row}>
      <View style={styles.bubble}>
        <View style={styles.dots}>{[0, 1, 2].map((index) => (
          <Animated.View key={index} style={[styles.dot, !reducedMotion && {
            opacity: progress.interpolate({ inputRange: [0, 0.1 + index * 0.17, 0.27 + index * 0.17, 0.44 + index * 0.17, 1], outputRange: [0.35, 0.35, 1, 0.35, 0.35] }),
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 0.1 + index * 0.17, 0.27 + index * 0.17, 0.44 + index * 0.17, 1], outputRange: [0, 0, -3, 0, 0] }) }],
          }]} />
        ))}</View>
        <Text style={styles.text}>digitando…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: 18, borderBottomLeftRadius: 5, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dot: { backgroundColor: colors.primary, borderRadius: radius.round, height: 5, width: 5 },
  dots: { flexDirection: "row", gap: 3 },
  row: { alignItems: "flex-start" },
  text: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
});
