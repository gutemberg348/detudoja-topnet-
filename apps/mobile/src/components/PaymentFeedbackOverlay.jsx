import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

const stateCopy = {
  error: {
    accent: colors.danger,
    background: "#FDE8E8",
    icon: "close",
    message: "Confira os dados e tente novamente.",
    title: "Pagamento nao aprovado",
  },
  processing: {
    accent: colors.primaryDark,
    background: colors.card,
    icon: null,
    message: "Aguarde enquanto confirmamos a transacao.",
    title: "Processando pagamento",
  },
  success: {
    accent: colors.success,
    background: "#E3F8EA",
    icon: "checkmark",
    message: "Tudo certo. Seu pagamento foi confirmado.",
    title: "Pagamento aprovado",
  },
};

export function PaymentFeedbackOverlay({
  amountCents,
  counterparty,
  durationMs = 3000,
  message,
  onDismiss,
  onFinished,
  status = "processing",
  title,
  visible,
}) {
  const finishedRef = useRef(onFinished);
  const pulse = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const successPop = useRef(new Animated.Value(0)).current;
  const state = stateCopy[status] ?? stateCopy.processing;

  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!visible) return undefined;

    reveal.setValue(0);
    successPop.setValue(0);
    Animated.spring(reveal, {
      damping: 13,
      mass: 0.7,
      stiffness: 150,
      toValue: 1,
      useNativeDriver: false,
    }).start();

    if (status !== "processing") {
      pulse.stopAnimation();
      pulse.setValue(0);
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(successPop, {
          damping: 8,
          mass: 0.55,
          stiffness: 190,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
      return undefined;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 0,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [pulse, reveal, status, successPop, visible]);

  useEffect(() => {
    if (!visible || status !== "success") return undefined;
    const timer = setTimeout(() => finishedRef.current?.("success"), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, status, visible]);

  const backgroundColor = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.card, state.background],
  });
  const contentScale = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });
  const contentOpacity = reveal.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.7, 1],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 0],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1.42],
  });
  const resultScale = successPop.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [0.35, 1.1, 1],
  });

  return (
    <Modal
      animationType="fade"
      onRequestClose={status === "error" ? onDismiss : () => {}}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Animated.View
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        style={[styles.overlay, { backgroundColor }]}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: contentOpacity, transform: [{ scale: contentScale }] },
          ]}
        >
          <View style={styles.iconStage}>
            {status === "processing" ? (
              <Animated.View
                style={[
                  styles.pulse,
                  {
                    borderColor: state.accent,
                    opacity: pulseOpacity,
                    transform: [{ scale: pulseScale }],
                  },
                ]}
              />
            ) : null}
            <Animated.View
              style={[
                styles.iconShell,
                { backgroundColor: state.accent },
                status !== "processing" && {
                  opacity: successPop,
                  transform: [{ scale: resultScale }],
                },
              ]}
            >
              {status === "processing" ? (
                <ActivityIndicator color={colors.card} size="large" />
              ) : (
                <Ionicons color={colors.card} name={state.icon} size={47} />
              )}
            </Animated.View>
          </View>

          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: state.accent }]}>DETUDOJA PAY</Text>
            <Text style={styles.title}>{title || state.title}</Text>
            <Text style={styles.message}>{message || state.message}</Text>
          </View>

          {Number(amountCents) > 0 ? (
            <View style={styles.receipt}>
              <Text style={styles.receiptLabel}>Valor</Text>
              <Text style={styles.amount}>{formatarDinheiro(amountCents)}</Text>
              {counterparty ? (
                <Text numberOfLines={1} style={styles.counterparty}>{counterparty}</Text>
              ) : null}
            </View>
          ) : null}

          {status === "error" ? (
            <Pressable
              accessibilityLabel="Fechar erro e tentar pagamento novamente"
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: state.accent },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={colors.card} name="refresh-outline" size={19} />
              <Text style={styles.retryText}>Tentar novamente</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amount: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: 27, fontWeight: "800" },
  content: { alignItems: "center", gap: spacing.xl, maxWidth: 380, paddingHorizontal: spacing.xl, width: "100%" },
  copy: { alignItems: "center", gap: spacing.sm },
  counterparty: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small, maxWidth: 260 },
  eyebrow: { fontFamily: fonts.extraBold, fontSize: 10, fontWeight: "800" },
  iconShell: { alignItems: "center", borderRadius: radius.round, height: 92, justifyContent: "center", width: 92 },
  iconStage: { alignItems: "center", height: 126, justifyContent: "center", width: 126 },
  message: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.body, lineHeight: 22, maxWidth: 330, textAlign: "center" },
  overlay: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.xl },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  pulse: { borderRadius: radius.round, borderWidth: 3, height: 108, position: "absolute", width: 108 },
  receipt: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.72)", borderColor: "rgba(120,134,125,0.18)", borderRadius: radius.lg, borderWidth: 1, gap: 4, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, width: "100%" },
  receiptLabel: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, textTransform: "uppercase" },
  retryButton: { alignItems: "center", borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50, paddingHorizontal: spacing.xl, width: "100%" },
  retryText: { color: colors.card, fontFamily: fonts.bold, fontSize: typography.label },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: 27, fontWeight: "800", textAlign: "center" },
});
