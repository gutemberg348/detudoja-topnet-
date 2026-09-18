import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

export function IncomingServiceAlert({ alert, loading, onAccept, onClose, onPress }) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!alert) return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { duration: 650, toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: 650, toValue: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [alert, pulse]);

  if (!alert) return null;

  const isCourier = alert.kind === "courier";

  return (
    <View
      accessibilityLiveRegion="assertive"
      style={[styles.layer, { paddingTop: Math.max(insets.top, spacing.sm) }]}
    >
      <Pressable
        accessibilityLabel={isCourier ? "Abrir chamada de corrida" : "Abrir chamado de servico"}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <Animated.View
          style={[
            styles.icon,
            isCourier && styles.iconCourier,
            {
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) }],
            },
          ]}
        >
          <Ionicons
            color={colors.card}
            name={isCourier ? "bicycle" : "chatbubble-ellipses"}
            size={21}
          />
        </Animated.View>
        <View style={styles.copy}>
          <View style={styles.eyebrowLine}>
            <View style={styles.liveDot} />
            <Text style={styles.eyebrow}>{isCourier ? "NOVA CORRIDA" : "NOVO CHAMADO"}</Text>
          </View>
          <Text numberOfLines={1} style={styles.title}>{alert.title}</Text>
          <Text numberOfLines={2} style={styles.subtitle}>{alert.subtitle}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Aceitar chamado"
            disabled={loading}
            onPress={(event) => {
              event.stopPropagation?.();
              onAccept();
            }}
            style={styles.accept}
          >
            {loading ? (
              <ActivityIndicator color={colors.card} size="small" />
            ) : (
              <>
                <Ionicons color={colors.card} name="checkmark" size={16} />
                <Text style={styles.acceptText}>Aceitar</Text>
              </>
            )}
          </Pressable>
          <Pressable
            accessibilityLabel="Recusar chamado"
            disabled={loading}
            onPress={(event) => {
              event.stopPropagation?.();
              onClose();
            }}
            style={styles.later}
          >
            <Text style={styles.laterText}>Recusar</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel="Fechar notificacao"
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation?.();
            onClose();
          }}
          style={styles.close}
        >
          <Ionicons color={colors.textMuted} name="close" size={16} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  accept: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  acceptText: {
    color: colors.card,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  actions: { alignItems: "stretch", gap: 5 },
  card: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    maxWidth: 540,
    minHeight: 88,
    padding: spacing.md,
    paddingRight: 36,
    width: "100%",
    ...shadow,
  },
  close: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: 5,
    top: 5,
    width: 28,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.danger,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  eyebrowLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  iconCourier: {
    backgroundColor: colors.primaryDark,
  },
  layer: {
    left: spacing.md,
    pointerEvents: "box-none",
    position: "absolute",
    right: spacing.md,
    top: 0,
    zIndex: 100,
  },
  liveDot: {
    backgroundColor: colors.danger,
    borderRadius: radius.round,
    height: 7,
    width: 7,
  },
  later: { alignItems: "center", minHeight: 25, justifyContent: "center" },
  laterText: { color: colors.textSecondary, fontFamily: fonts.semiBold, fontSize: 9 },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
});
