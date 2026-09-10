import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { BackHeader } from "../components/BackHeader";
import { BrandLogo } from "../components/BrandLogo";
import { ScreenContainer } from "../components/ScreenContainer";
import { ApiError } from "../services/api";
import { requestAppPasswordReset } from "../services/auth.api";
import { colors, fonts, spacing, typography } from "../utils/theme";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!emailPattern.test(normalizedEmail)) {
      setError("Informe um e-mail valido.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await requestAppPasswordReset(normalizedEmail);
      setSent(true);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Nao foi possivel enviar o link agora. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <BackHeader onPress={navigation.goBack} />
      <BrandLogo centered size="regular" />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>ACESSO SEGURO</Text>
        <Text style={styles.title}>Recupere sua senha</Text>
        <Text style={styles.subtitle}>
          Informe seu e-mail. Vamos enviar um link seguro para criar uma nova senha.
        </Text>
      </View>

      {sent ? (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Confira seu e-mail</Text>
          <Text style={styles.successText}>
            Se existir uma conta com este e-mail, o link de recuperacao foi enviado.
          </Text>
          <AppButton onPress={() => navigation.navigate("Login")} title="Voltar para entrar" />
        </View>
      ) : (
        <View style={styles.form}>
          <AppInput
            autoComplete="email"
            autoFocus
            error={error}
            icon="mail-outline"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={(value) => {
              setEmail(value);
              setError("");
            }}
            onSubmitEditing={handleSubmit}
            placeholder="seu@email.com"
            returnKeyType="send"
            textContentType="emailAddress"
            value={email}
          />
          <AppButton
            icon="send-outline"
            loading={submitting}
            onPress={handleSubmit}
            title="Enviar link de recuperacao"
          />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.lg,
  },
  copy: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  form: {
    gap: spacing.lg,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  successCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  successText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 22,
  },
  successTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h1,
    fontWeight: "800",
  },
});
