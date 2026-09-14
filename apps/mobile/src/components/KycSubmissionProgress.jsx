import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

const steps = [
  { icon: "documents-outline", label: "Enviando documentos" },
  { icon: "cloud-done-outline", label: "Envio protegido concluído" },
  { icon: "scan-outline", label: "Análise de identidade iniciada" },
];

const stageIndex = { ANALYZING: 2, SENT: 1, UPLOADING: 0 };
const stageCopy = {
  ANALYZING: {
    text: "Você já pode sair desta tela. O resultado será atualizado automaticamente.",
    title: "Tudo certo, estamos analisando",
  },
  SENT: {
    text: "As imagens foram armazenadas com segurança e serão processadas em segundo plano.",
    title: "Documentos recebidos",
  },
  UPLOADING: {
    text: "Protegendo e enviando as imagens. Mantenha o aplicativo aberto por alguns instantes.",
    title: "Enviando sua verificação",
  },
};

export function KycSubmissionProgress({ stage }) {
  const pulse = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (!stage) return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {
        duration: 650,
        easing: Easing.inOut(Easing.ease),
        toValue: 1.06,
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        duration: 650,
        easing: Easing.inOut(Easing.ease),
        toValue: 0.92,
        useNativeDriver: true,
      }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, stage]);

  if (!stage) return null;
  const activeIndex = stageIndex[stage] ?? 0;
  const copy = stageCopy[stage] ?? stageCopy.UPLOADING;

  return (
    <Modal animationType="fade" onRequestClose={() => {}} statusBarTranslucent transparent visible>
      <View style={styles.overlay}>
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <Animated.View style={[styles.heroIcon, { transform: [{ scale: pulse }] }]}>
            <Ionicons color={colors.card} name="shield-checkmark-outline" size={38} />
          </Animated.View>
          <View style={styles.copy}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.text}>{copy.text}</Text>
          </View>
          <View style={styles.steps}>
            {steps.map((step, index) => {
              const complete = index < activeIndex;
              const active = index === activeIndex;
              return (
                <View key={step.label} style={styles.step}>
                  <View style={[styles.stepIcon, (active || complete) && styles.stepIconActive]}>
                    <Ionicons
                      color={active || complete ? colors.primaryDark : colors.textMuted}
                      name={complete ? "checkmark" : step.icon}
                      size={20}
                    />
                  </View>
                  <Text style={[styles.stepLabel, (active || complete) && styles.stepLabelActive]}>
                    {step.label}
                  </Text>
                  {active ? <View style={styles.activeDot} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  activeDot: { backgroundColor: colors.primary, borderRadius: 999, height: 8, width: 8 },
  card: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    gap: spacing.xl,
    marginHorizontal: spacing.xl,
    maxWidth: 420,
    padding: spacing.xxl,
    width: "88%",
    ...shadow,
  },
  copy: { alignItems: "center", gap: spacing.sm },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: 999,
    height: 82,
    justifyContent: "center",
    width: 82,
  },
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(8, 24, 17, 0.64)",
    flex: 1,
    justifyContent: "center",
  },
  step: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 42 },
  stepIcon: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  stepIconActive: { backgroundColor: colors.primarySoft },
  stepLabel: { color: colors.textMuted, flex: 1, fontFamily: fonts.medium, fontSize: typography.small },
  stepLabelActive: { color: colors.textPrimary, fontFamily: fonts.bold },
  steps: { alignSelf: "stretch", gap: spacing.xs },
  text: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: "center",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
    textAlign: "center",
  },
});
