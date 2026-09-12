import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  formatLogin,
  formatPhone,
  normalizeLogin,
  onlyDigits,
  validateLoginFields,
  validateRegistrationFields,
} from "../utils/authValidation";
import { colors, fonts, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";

export function AuthCredentialsForm({
  mode = "login",
  onForgotPassword,
  registrationCode = "",
  storeSlug = "",
}) {
  const { login, register } = useAuthStore();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginValue, setLoginValue] = useState("");
  const [inviteCode, setInviteCode] = useState(registrationCode);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const isLogin = mode === "login";
  const isInviteLocked = Boolean(registrationCode);

  useEffect(() => {
    if (registrationCode) {
      setInviteCode(registrationCode);
    }
  }, [registrationCode]);

  function updateField(setter, field, formatter = (value) => value) {
    return (value) => {
      setter(formatter(value));
      setErrors((current) => ({ ...current, [field]: undefined }));
      setMessage("");
    };
  }

  async function handleSubmit() {
    const fieldErrors = isLogin
      ? validateLoginFields({ login: loginValue, password })
      : validateRegistrationFields({ email, name, password, phone });

    setErrors(fieldErrors);
    setMessage("");

    if (Object.keys(fieldErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isLogin) {
        await login({ login: normalizeLogin(loginValue), password });
      } else {
        await register({
          email: email.trim().toLowerCase(),
          ...(inviteCode.trim()
            ? { inviteCode: inviteCode.trim().toUpperCase() }
            : {}),
          ...(storeSlug ? { storeSlug } : {}),
          name: name.trim(),
          password,
          ...(phone.trim() ? { phone: onlyDigits(phone) } : {}),
        });
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setMessage("E-mail, telefone ou senha invalidos.");
      } else if (requestError instanceof ApiError && requestError.status === 400) {
        setMessage("Confira os dados informados e tente novamente.");
      } else if (requestError instanceof ApiError && requestError.status === 409) {
        setMessage(requestError.message);
      } else {
        setMessage("Nao foi possivel conectar a API. Verifique a conexao.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      {!isLogin ? (
        <>
          <AppInput
            autoCapitalize="words"
            autoComplete="name"
            error={errors.name}
            icon="person-outline"
            onChangeText={updateField(setName, "name")}
            placeholder="Nome completo"
            returnKeyType="next"
            textContentType="name"
            value={name}
          />
          <AppInput
            autoComplete="tel"
            error={errors.phone}
            icon="call-outline"
            inputMode="tel"
            keyboardType="phone-pad"
            maxLength={15}
            onChangeText={updateField(setPhone, "phone", formatPhone)}
            placeholder="Telefone com DDD (opcional)"
            returnKeyType="next"
            textContentType="telephoneNumber"
            value={phone}
          />
          <AppInput
            autoComplete="email"
            error={errors.email}
            icon="mail-outline"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={updateField(setEmail, "email")}
            placeholder="seu@email.com"
            returnKeyType="next"
            textContentType="emailAddress"
            value={email}
          />
          {storeSlug ? (
            <View style={styles.storeOrigin}>
              <View style={styles.storeOriginIcon}>
                <Text style={styles.storeOriginIconText}>d</Text>
              </View>
              <View style={styles.storeOriginCopy}>
                <Text style={styles.storeOriginTitle}>Cadastro indicado por uma loja</Text>
                <Text style={styles.storeOriginText}>Sua origem ja esta aplicada. Conclua seus dados.</Text>
              </View>
            </View>
          ) : isInviteLocked ? (
            <AppInput
              autoCapitalize="characters"
              autoComplete="off"
              editable={false}
              icon="lock-closed-outline"
              label="Codigo do convite"
              placeholder="Codigo de convite"
              value={inviteCode}
            />
          ) : (
            <AppInput
              autoCapitalize="characters"
              autoComplete="off"
              icon="people-outline"
              onChangeText={updateField(setInviteCode, "inviteCode")}
              placeholder="Codigo de convite ou da loja"
              returnKeyType="next"
              value={inviteCode}
            />
          )}
        </>
      ) : (
        <AppInput
          autoComplete="username"
          error={errors.login}
          icon="person-circle-outline"
          keyboardType="email-address"
          onChangeText={updateField(setLoginValue, "login", formatLogin)}
          placeholder="E-mail ou telefone"
          returnKeyType="next"
          textContentType="username"
          value={loginValue}
        />
      )}

      <AppInput
        autoComplete={isLogin ? "current-password" : "new-password"}
        error={errors.password}
        icon="lock-closed-outline"
        onChangeText={updateField(setPassword, "password")}
        onSubmitEditing={handleSubmit}
        placeholder={isLogin ? "Senha" : "Crie uma senha"}
        returnKeyType="done"
        secureTextEntry
        textContentType={isLogin ? "password" : "newPassword"}
        value={password}
      />

      {isLogin ? (
        <Pressable
          accessibilityRole="button"
          onPress={onForgotPassword}
          style={({ pressed }) => [styles.forgotButton, pressed && styles.forgotPressed]}
        >
          <Text style={styles.forgot}>Esqueci minha senha</Text>
        </Pressable>
      ) : null}

      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : null}

      <AppButton
        loading={isSubmitting}
        onPress={handleSubmit}
        style={styles.submitButton}
        title={isLogin ? "Entrar" : "Criar conta"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  storeOrigin: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  storeOriginCopy: { flex: 1, gap: 2, minWidth: 0 },
  storeOriginIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  storeOriginIconText: { color: colors.card, fontFamily: fonts.extraBold, fontSize: 21 },
  storeOriginText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  storeOriginTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  forgot: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  forgotButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center",
  },
  forgotPressed: {
    opacity: 0.7,
  },
  form: {
    gap: spacing.md,
  },
  message: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
  },
  submitButton: {
    minHeight: 56,
  },
});
