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
import { searchAddresses } from "../../services/cep.api";
import { getCurrentUserAddresses } from "../../services/users.api";
import { useAuthStore } from "../../stores/useAuthStore";
import { onlyDigits } from "../../utils/authValidation";
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
  const { session } = useAuthStore();
  const lookupRef = useRef(0);
  const [address, setAddress] = useState(emptyAddress);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (!open) {
      setAddress(emptyAddress);
      setError("");
      setQuery("");
      setSuggestions([]);
      setLookingUp(false);
      return;
    }
    if (!session?.accessToken) return;
    getCurrentUserAddresses(session.accessToken)
      .then((response) => {
        const saved = response.addresses?.[0];
        const location = response.marketplaceLocation;
        setAddress((current) => ({
          ...current,
          city: saved?.cidade ?? location?.city ?? current.city,
          state: saved?.estado ?? location?.state ?? current.state,
        }));
      })
      .catch(() => {});
  }, [open, session?.accessToken]);

  useEffect(() => {
    const search = query.trim();
    if (!open || search.length < 3 || address.city.trim().length < 2 || address.state.trim().length !== 2) {
      setSuggestions([]);
      setLookingUp(false);
      return undefined;
    }

    const requestId = lookupRef.current + 1;
    lookupRef.current = requestId;
    const timer = setTimeout(() => {
      setLookingUp(true);
      setError("");
      searchAddresses({ city: address.city, state: address.state, street: search })
        .then((results) => {
          if (lookupRef.current !== requestId) return;
          setSuggestions(results);
          if (!results.length) setError("Nenhum endereco encontrado. Tente o nome da rua ou avenida.");
        })
        .catch((requestError) => {
          if (lookupRef.current === requestId) {
            setSuggestions([]);
            setError(requestError.message ?? "Nao foi possivel buscar enderecos.");
          }
        })
        .finally(() => {
          if (lookupRef.current === requestId) setLookingUp(false);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [address.city, address.state, open, query]);

  function update(field, value) {
    setAddress((current) => ({
      ...current,
      [field]: value,
      ...(["city", "state"].includes(field) ? { district: "", street: "", zipCode: "" } : {}),
    }));
    if (["city", "state"].includes(field)) {
      setQuery("");
      setSuggestions([]);
    }
    setError("");
  }

  function selectSuggestion(suggestion) {
    setAddress((current) => ({
      ...current,
      city: suggestion.city,
      district: suggestion.district,
      state: suggestion.state,
      street: suggestion.street,
      zipCode: onlyDigits(suggestion.zipCode),
    }));
    setQuery("");
    setSuggestions([]);
    setError("");
  }

  function submit() {
    if (onlyDigits(address.zipCode).length !== 8) {
      setError("Pesquise a rua e escolha um endereco da lista.");
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
              <Text style={styles.title}>Encontrar um endereco</Text>
              <Text style={styles.subtitle}>Pesquise pela rua ou bairro. Voce nao precisa saber o CEP.</Text>
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

            <View style={styles.row}>
              <AppInput
                autoCapitalize="words"
                containerStyle={styles.city}
                icon="business-outline"
                label="Cidade"
                onChangeText={(value) => update("city", value)}
                placeholder="Sua cidade"
                value={address.city}
              />
              <AppInput autoCapitalize="characters" containerStyle={styles.state} label="UF" maxLength={2} onChangeText={(value) => update("state", value.toUpperCase())} value={address.state} />
            </View>

            <View style={styles.searchField}>
              <AppInput
                autoCapitalize="words"
                icon="search-outline"
                label="Rua ou bairro"
                onChangeText={(value) => {
                  setQuery(value);
                  setAddress((current) => ({ ...current, district: "", street: "", zipCode: "" }));
                  setError("");
                }}
                placeholder="Ex.: Rua Sao Pedro ou Centro"
                value={query}
              />
              {lookingUp ? <ActivityIndicator color={colors.primaryDark} style={styles.lookup} /> : null}
            </View>

            {suggestions.length ? (
              <View style={styles.resultsShell}>
                <Text style={styles.resultsTitle}>Escolha o endereco</Text>
                <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled style={styles.results}>
                  {suggestions.map((suggestion, index) => (
                    <Pressable
                      key={`${suggestion.zipCode}-${suggestion.street}-${index}`}
                      onPress={() => selectSuggestion(suggestion)}
                      style={[styles.result, index < suggestions.length - 1 && styles.resultDivider]}
                    >
                      <View style={styles.resultIcon}><Ionicons color={colors.primaryDark} name="location-outline" size={17} /></View>
                      <View style={styles.resultCopy}>
                        <Text numberOfLines={1} style={styles.resultStreet}>{suggestion.street || query}</Text>
                        <Text numberOfLines={1} style={styles.resultMeta}>{suggestion.district || "Bairro nao informado"} · {suggestion.city}/{suggestion.state}</Text>
                      </View>
                      <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {address.zipCode ? (
              <View style={styles.selectedAddress}>
                <View style={styles.selectedIcon}><Ionicons color={colors.card} name="checkmark" size={18} /></View>
                <View style={styles.resultCopy}>
                  <Text style={styles.selectedTitle}>Endereco selecionado</Text>
                  <Text style={styles.selectedText}>{address.street}{address.district ? ` · ${address.district}` : ""}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.row}>
              <AppInput containerStyle={styles.number} icon="home-outline" label="Numero" onChangeText={(value) => update("number", value)} value={address.number} />
              <AppInput containerStyle={styles.complement} icon="business-outline" label="Complemento" onChangeText={(value) => update("complement", value)} placeholder="Apto, bloco..." value={address.complement} />
            </View>
            {address.zipCode && !address.district ? <AppInput autoCapitalize="words" icon="location-outline" label="Bairro" onChangeText={(value) => update("district", value)} value={address.district} /> : null}
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
  result: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 58, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  resultCopy: { flex: 1, minWidth: 0 },
  resultDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  resultIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  resultMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  results: { maxHeight: 232 },
  resultsShell: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  resultsTitle: { backgroundColor: colors.cardMuted, color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  resultStreet: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  searchField: { position: "relative" },
  selectedAddress: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  selectedIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  selectedText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 11, marginTop: 2 },
  selectedTitle: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.caption },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", ...shadowSoft },
  state: { width: 78 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
});
