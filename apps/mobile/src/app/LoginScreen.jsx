import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AuthCredentialsForm } from "../components/AuthCredentialsForm";
import { AuthDivider } from "../components/AuthDivider";
import { BrandLogo } from "../components/BrandLogo";
import { ScreenContainer } from "../components/ScreenContainer";
import { SocialAuthButtons } from "../components/SocialAuthButtons";
import { colors, fonts, spacing, typography } from "../utils/theme";

export function LoginScreen({ navigation }) {
  const [emailFormVisible, setEmailFormVisible] = useState(false);

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.logoArea}>
        <BrandLogo centered size="large" />
      </View>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>Bem-vindo de volta</Text>
        <Text style={styles.title}>Entre na sua conta</Text>
      </View>

      <View style={styles.social}>
        <SocialAuthButtons />

        {emailFormVisible ? (
          <AuthDivider label="ou entre com e-mail" />
        ) : (
          <>
            <AppButton
              icon="mail-outline"
              onPress={() => setEmailFormVisible(true)}
              title="Entrar com e-mail"
              variant="outline"
            />
          </>
        )}
      </View>

      {emailFormVisible ? (
        <View style={styles.credentials}>
          <AuthCredentialsForm
            onForgotPassword={() => navigation.navigate("ForgotPassword")}
          />
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Ainda nao tem uma conta?</Text>
        <Pressable onPress={() => navigation.navigate("Register")}>
          <Text style={styles.footerLink}>Criar conta</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xxl,
  },
  credentials: {
    marginTop: spacing.lg,
  },
  eyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  footerLink: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  footerText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
  },
  heading: {
    gap: spacing.sm,
  },
  logoArea: {
    marginBottom: spacing.xl,
  },
  social: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h1,
    fontWeight: "800",
    textAlign: "center",
  },
});
