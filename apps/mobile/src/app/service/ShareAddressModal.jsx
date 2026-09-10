import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { fetchCepAddress } from "../../services/cep.api";
import { formatCep, onlyDigits } from "../../utils/authValidation";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";

const emptyAddress = {
  city: "",
  complement: "",
  district: "",
  label: "RETIRADA",
  number: "",
  reference: "",
  state: "",
  street: "",
  zipCode: "",
};

const labels = [
  { icon: "location-outline", label: "Retirada", value: "RETIRADA" },
  { icon: "flag-outline", label: "Destino", value: "DESTINO" },
  { icon: "pin-outline", label: "Outro local", value: "OUTRO" },
];

export function ShareAddressModal({ loading, onClose, onSubmit, open }) {
  const lookupRef = useRef(0);
  const [address, setAddress] = useState(emptyAddress);
  const [error, setError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (!open) {
      setAddress(emptyAddress);
      setError("");
      setLookingUp(false);
    }
  }, [open]);

  useEffect(() => {
    const digits = onlyDigits(address.zipCode);
    if (!open || digits.length !== 8) return undefined;

    const requestId = lookupRef.current + 1;
    lookupRef.current = requestId;
    setLookingUp(true);
    setError("");

    fetchCepAddress(digits)
      .then((result) => {
        if (lookupRef.current !== requestId) return;
        setAddress((current) => ({
          ...current,
          city: result.cidade,
          district: result.bairro,
          state: result.estado,
          street: result.rua,
          zipCode: formatCep(result.cep),
        }));
      })
      .catch((requestError) => {
        if (lookupRef.current === requestId) {
          setError(requestError.message ?? "Nao foi possivel consultar o CEP.");
        }
      })
      .finally(() => {
        if (lookupRef.current === requestId) setLookingUp(false);
      });

    return undefined;
  }, [address.zipCode, open]);

  function update(field, value) {
    setAddress((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    if (onlyDigits(address.zipCode).length !== 8) {
      setError("Informe um CEP valido.");
      return;
    }
    if (!address.street.trim() || !address.number.trim() || !address.district.trim()) {
      setError("Confirme rua, numero e bairro.");
      return;
    }
    if (!address.city.trim() || address.state.trim().length !== 2) {
      setError("Confirme a cidade e a UF.");
      return;
    }

    onSubmit({
      ...address,
      city: address.city.trim(),
      complement: address.complement.trim(),
      district: address.district.trim(),
      number: address.number.trim(),
      reference: address.reference.trim(),
      state: address.state.trim().toUpperCase(),
      street: address.street.trim(),
      zipCode: onlyDigits(address.zipCode),
    });
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.primaryDark} name="location-outline" size={22} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>COMPARTILHAR NO CHAT</Text>
              <Text style={styles.title}>Enviar um endereco</Text>
              <Text style={styles.subtitle}>O CEP preenche a regiao. Confirme o numero antes de enviar.</Text>
            </View>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.close}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.labelOptions}>
              {labels.map((item) => {
                const active = address.label === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => update("label", item.value)}
                    style={[styles.labelOption, active && styles.labelOptionActive]}
                  >
                    <Ionicons
                      color={active ? colors.card : colors.primaryDark}
                      name={item.icon}
                      size={17}
                    />
                    <Text style={[styles.labelText, active && styles.labelTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.cepField}>
              <AppInput
                autoComplete="postal-code"
                icon="navigate-outline"
                keyboardType="number-pad"
                label="CEP"
                maxLength={9}
                onChangeText={(value) => update("zipCode", formatCep(value))}
                placeholder="00000-000"
                value={address.zipCode}
              />
              {lookingUp ? <ActivityIndicator color={colors.primaryDark} style={styles.lookup} /> : null}
            </View>
            <AppInput autoCapitalize="words" icon="map-outline" label="Rua" onChangeText={(value) => update("street", value)} value={address.street} />
            <View style={styles.row}>
              <AppInput containerStyle={styles.number} icon="home-outline" label="Numero" onChangeText={(value) => update("number", value)} value={address.number} />
              <AppInput containerStyle={styles.complement} icon="business-outline" label="Complemento" onChangeText={(value) => update("complement", value)} placeholder="Apto, bloco..." value={address.complement} />
            </View>
            <AppInput autoCapitalize="words" icon="location-outline" label="Bairro" onChangeText={(value) => update("district", value)} value={address.district} />
            <View style={styles.row}>
              <AppInput autoCapitalize="words" containerStyle={styles.city} icon="business-outline" label="Cidade" onChangeText={(value) => update("city", value)} value={address.city} />
              <AppInput autoCapitalize="characters" containerStyle={styles.state} label="UF" maxLength={2} onChangeText={(value) => update("state", value.toUpperCase())} value={address.state} />
            </View>
            <AppInput autoCapitalize="sentences" icon="flag-outline" label="Ponto de referencia" onChangeText={(value) => update("reference", value)} placeholder="Portao, esquina, comercio proximo..." value={address.reference} />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              icon="send-outline"
              loading={loading}
              onPress={submit}
              title="Enviar endereco no chat"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(8, 24, 18, 0.46)", flex: 1, justifyContent: "flex-end" },
  cepField: { position: "relative" },
  city: { flex: 1 },
  close: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  complement: { flex: 1.4 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9 },
  form: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl },
  handle: { alignSelf: "center", backgroundColor: colors.border, borderRadius: radius.round, height: 4, marginTop: 8, width: 42 },
  header: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  headerCopy: { flex: 1, gap: 2 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  labelOption: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 40, paddingHorizontal: 12 },
  labelOptionActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  labelOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  labelText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  labelTextActive: { color: colors.card },
  lookup: { bottom: 17, position: "absolute", right: 18 },
  number: { flex: 0.8 },
  row: { flexDirection: "row", gap: spacing.sm },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", ...shadowSoft },
  state: { width: 78 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
});
