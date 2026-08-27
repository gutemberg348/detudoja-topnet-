import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AuthCredentialsForm } from "../components/AuthCredentialsForm";
import { AuthDivider } from "../components/AuthDivider";
import { ScreenContainer } from "../components/ScreenContainer";
import { SocialAuthButtons } from "../components/SocialAuthButtons";
import { colors, fonts, spacing, typography } from "../utils/theme";

export function RegisterScreen({ navigation, route }) {
  const storeSlug = route.params?.storeSlug ?? "";
  const registrationCode = route.params?.registrationCode ?? "";
  const [emailFormVisible, setEmailFormVisible] = useState(Boolean(storeSlug || registrationCode));

  useEffect(() => {
    if (storeSlug || registrationCode) {
      setEmailFormVisible(true);
    }
  }, [registrationCode, storeSlug]);

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>Conta consumidor</Text>
        <Text style={styles.title}>Crie seu cadastro</Text>
      </View>

      <View style={styles.social}>
        <SocialAuthButtons action="Cadastrar" />

        {emailFormVisible ? (
          <AuthDivider label="ou cadastre com e-mail" />
        ) : (
          <>
            <AppButton
              icon="mail-outline"
              onPress={() => setEmailFormVisible(true)}
              title="Cadastrar com e-mail"
              variant="outline"
            />
          </>
        )}
      </View>

      {emailFormVisible ? (
        <View style={styles.credentials}>
          <AuthCredentialsForm
            mode="register"
            registrationCode={registrationCode}
            storeSlug={storeSlug}
          />
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Ja tem uma conta?</Text>
        <Pressable onPress={() => navigation.navigate("Login")}>
          <Text style={styles.footerLink}>Entrar</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: "center",
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
