import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AuthCredentialsForm } from "../components/AuthCredentialsForm";
import { AuthDivider } from "../components/AuthDivider";
import { BrandLogo } from "../components/BrandLogo";
import { ScreenContainer } from "../components/ScreenContainer";
import { SocialAuthButtons } from "../components/SocialAuthButtons";
import {
  colors,
  fonts,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

export function OnboardingScreen({ navigation }) {
  const [mode, setMode] = useState("login");
  const [emailFormVisible, setEmailFormVisible] = useState(false);

  function changeMode(nextMode) {
    setEmailFormVisible(false);
    setMode(nextMode);
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.logoArea}>
        <BrandLogo centered size="large" />
        <Text style={styles.title}>Bem-vindo ao Brasil Cashback</Text>
      </View>

      <View style={styles.formCard}>
        <View style={styles.segment}>
          <SegmentButton
            active={mode === "login"}
            label="Entrar"
            onPress={() => changeMode("login")}
          />
          <SegmentButton
            active={mode === "register"}
            label="Cadastrar"
            onPress={() => changeMode("register")}
          />
        </View>

        <View style={styles.socialBlock}>
          <SocialAuthButtons
            action={mode === "login" ? "Entrar" : "Cadastrar"}
          />

          {emailFormVisible ? (
            <AuthDivider
              label={
                mode === "login"
                  ? "ou entre com e-mail"
                  : "ou cadastre com e-mail"
              }
            />
          ) : (
            <>
              <AppButton
                icon="mail-outline"
                onPress={() => setEmailFormVisible(true)}
                title={mode === "login" ? "Entrar com e-mail" : "Cadastrar com e-mail"}
                variant="outline"
              />
            </>
          )}
        </View>

        {emailFormVisible ? (
          <AuthCredentialsForm
            key={mode}
            mode={mode}
            onForgotPassword={() => navigation.navigate("ForgotPassword")}
          />
        ) : null}
      </View>

      <View style={styles.security}>
        <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={18} />
        <Text style={styles.securityText}>
          Seus dados protegidos com segurança
        </Text>
      </View>
    </ScreenContainer>
  );
}

function SegmentButton({ active, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
  },
  formCard: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  logoArea: {
    alignItems: "center",
    gap: spacing.lg,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xl,
  },
  security: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  securityText: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: typography.small,
    fontWeight: "600",
  },
  segment: {
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    flexDirection: "row",
    padding: spacing.xs,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    minHeight: 54,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: colors.card,
    borderBottomColor: colors.primary,
    borderBottomWidth: 3,
    ...shadow,
  },
  segmentText: {
    color: colors.textSecondary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: colors.primaryDark,
  },
  socialBlock: {
    gap: spacing.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 23,
    maxWidth: 310,
    textAlign: "center",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
    textAlign: "center",
  },
});
