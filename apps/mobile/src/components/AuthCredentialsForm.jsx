import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../services/api";
import { fetchCepAddress } from "../services/cep.api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  formatLogin,
  formatCep,
  formatPhone,
  normalizeLogin,
  onlyDigits,
  validateLoginFields,
  validateRegistrationFields,
} from "../utils/authValidation";
import { colors, fonts, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";

export function AuthCredentialsForm({ mode = "login", registrationCode = "", storeSlug = "" }) {
  const { login, register } = useAuthStore();
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState({
    city: "",
    complement: "",
    district: "",
    number: "",
    reference: "",
    state: "",
    street: "",
    zipCode: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginValue, setLoginValue] = useState("");
  const [inviteCode, setInviteCode] = useState(registrationCode);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const isLogin = mode === "login";

  function updateField(setter, field, formatter = (value) => value) {
    return (value) => {
      setter(formatter(value));
      setErrors((current) => ({ ...current, [field]: undefined }));
      setMessage("");
    };
  }

  function updateAddressField(field, formatter = (value) => value) {
    return (value) => {
      setAddress((current) => ({ ...current, [field]: formatter(value) }));
      setErrors((current) => ({ ...current, [field]: undefined }));
      setMessage("");
    };
  }

  async function handleCepChange(value) {
    const zipCode = formatCep(value);
    updateAddressField("zipCode", formatCep)(value);

    if (onlyDigits(zipCode).length !== 8) {
      return;
    }

    try {
      const cepAddress = await fetchCepAddress(zipCode);
      setAddress((current) => ({
        ...current,
        city: cepAddress.cidade || current.city,
        district: cepAddress.bairro || current.district,
        state: cepAddress.estado || current.state,
        street: cepAddress.rua || current.street,
        zipCode,
      }));
    } catch {
      setMessage("Nao encontramos esse CEP. Complete seu endereco manualmente.");
    }
  }

  async function handleSubmit() {
    const fieldErrors = isLogin
      ? validateLoginFields({ login: loginValue, password })
      : validateRegistrationFields({ address, email, name, password, phone });

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
          address: {
            ...address,
            state: address.state.trim().toUpperCase(),
            zipCode: onlyDigits(address.zipCode),
          },
          email: email.trim().toLowerCase(),
          ...(inviteCode.trim()
            ? { inviteCode: inviteCode.trim().toUpperCase() }
            : {}),
          ...(storeSlug ? { storeSlug } : {}),
          name: name.trim(),
          password,
          phone: onlyDigits(phone),
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
            placeholder="(00) 00000-0000"
            returnKeyType="next"
            textContentType="telephoneNumber"
            value={phone}
          />
          <View style={styles.locationBlock}>
            <Text style={styles.locationTitle}>Sua cidade</Text>
            <Text style={styles.locationHint}>Mostramos lojas, servicos e ofertas da sua regiao.</Text>
            <AppInput
              autoComplete="postal-code"
              error={errors.zipCode}
              icon="location-outline"
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={9}
              onChangeText={handleCepChange}
              placeholder="CEP"
              value={address.zipCode}
            />
            <AppInput
              autoCapitalize="words"
              error={errors.street}
              icon="map-outline"
              onChangeText={updateAddressField("street")}
              placeholder="Rua ou avenida"
              value={address.street}
            />
            <AppInput
              error={errors.number}
              icon="business-outline"
              onChangeText={updateAddressField("number")}
              placeholder="Numero"
              value={address.number}
            />
            <AppInput
              autoCapitalize="words"
              error={errors.district}
              icon="navigate-outline"
              onChangeText={updateAddressField("district")}
              placeholder="Bairro"
              value={address.district}
            />
            <View style={styles.locationRow}>
              <View style={styles.locationCity}>
                <AppInput
                  autoCapitalize="words"
                  error={errors.city}
                  icon="location-outline"
                  onChangeText={updateAddressField("city")}
                  placeholder="Cidade"
                  value={address.city}
                />
              </View>
              <View style={styles.locationState}>
                <AppInput
                  autoCapitalize="characters"
                  error={errors.state}
                  maxLength={2}
                  onChangeText={updateAddressField("state", (value) => value.toUpperCase())}
                  placeholder="UF"
                  value={address.state}
                />
              </View>
            </View>
          </View>
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
          onPress={() => setMessage("Recuperacao de senha entra na proxima etapa.")}
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
  form: {
    gap: spacing.md,
  },
  locationBlock: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  locationCity: {
    flex: 1,
  },
  locationHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  locationRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  locationState: {
    width: 82,
  },
  locationTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
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
