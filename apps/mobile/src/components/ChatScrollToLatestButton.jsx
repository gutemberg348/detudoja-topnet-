import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius, shadowSoft } from "../utils/theme";

export function ChatScrollToLatestButton({ onPress, unreadCount = 0, visible }) {
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.8);
      return;
    }
    Animated.spring(scale, { friction: 7, tension: 110, toValue: 1, useNativeDriver: true }).start();
  }, [scale, visible]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.shell, { transform: [{ scale }] }]}>
      <Pressable accessibilityLabel={unreadCount ? `Ir para ${unreadCount} mensagens novas` : "Ir para a mensagem mais recente"} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Ionicons color={colors.primaryDark} name="chevron-down" size={23} />
        {unreadCount > 0 ? (
          <Text style={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: colors.primary, borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, color: colors.card, fontFamily: fonts.bold, fontSize: 9, minWidth: 20, paddingHorizontal: 4, paddingVertical: 2, position: "absolute", right: -5, textAlign: "center", top: -7 },
  button: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, height: 44, justifyContent: "center", width: 44, ...shadowSoft },
  pressed: { opacity: 0.82 },
  shell: { bottom: 12, position: "absolute", right: 18, zIndex: 20 },
});
