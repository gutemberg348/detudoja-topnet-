import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { BackHeader } from "../components/BackHeader";
import { BrandLogo } from "../components/BrandLogo";
import { ScreenContainer } from "../components/ScreenContainer";
import { ApiError } from "../services/api";
import { resetAppPassword } from "../services/auth.api";
import { colors, fonts, spacing, typography } from "../utils/theme";

export function ResetPasswordScreen({ navigation, route }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const token = String(route.params?.token ?? "").trim();

  async function handleSubmit() {
    if (!token) {
      setError("Este link de recuperacao esta incompleto. Solicite outro.");
      return;
    }

    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      setError("Use ao menos 8 caracteres, com uma letra e um numero.");
      return;
    }

    if (password !== confirmation) {
      setError("As senhas nao conferem.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await resetAppPassword({ password, token });
      setSuccess(true);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Nao foi possivel trocar sua senha agora.",
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
        <Text style={styles.eyebrow}>NOVA SENHA</Text>
        <Text style={styles.title}>Crie uma senha segura</Text>
        <Text style={styles.subtitle}>Ela sera usada no seu proximo acesso.</Text>
      </View>

      {success ? (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Senha atualizada</Text>
          <Text style={styles.successText}>Suas sessoes anteriores foram encerradas por seguranca.</Text>
          <AppButton onPress={() => navigation.navigate("Login")} title="Entrar com a nova senha" />
        </View>
      ) : (
        <View style={styles.form}>
          <AppInput
            autoComplete="new-password"
            error={error}
            icon="lock-closed-outline"
            onChangeText={(value) => {
              setPassword(value);
              setError("");
            }}
            placeholder="Nova senha"
            secureTextEntry
            textContentType="newPassword"
            value={password}
          />
          <AppInput
            autoComplete="new-password"
            icon="shield-checkmark-outline"
            onChangeText={(value) => {
              setConfirmation(value);
              setError("");
            }}
            onSubmitEditing={handleSubmit}
            placeholder="Confirme a nova senha"
            returnKeyType="done"
            secureTextEntry
            textContentType="newPassword"
            value={confirmation}
          />
          <AppButton
            loading={submitting}
            onPress={handleSubmit}
            title="Salvar nova senha"
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
    gap: spacing.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
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
