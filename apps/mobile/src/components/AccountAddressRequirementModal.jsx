import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchCepAddress } from "../services/cep.api";
import { getCurrentUserAddresses, updateCurrentUser } from "../services/users.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatCep, onlyDigits } from "../utils/authValidation";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";

const emptyAddress = { city: "", complement: "", district: "", number: "", reference: "", state: "", street: "", zipCode: "" };

export function AccountAddressRequirementModal({ onClose, onCompleted, open, reason = "continuar" }) {
  const { session, updateSessionUser } = useAuthStore();
  const [address, setAddress] = useState(emptyAddress);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const lookupRef = useRef(0);

  useEffect(() => {
    if (!open || !session?.accessToken) return;
    setError("");
    getCurrentUserAddresses(session.accessToken)
      .then(({ addresses = [] }) => {
        const current = addresses[0];
        if (!current) return;
        setAddress({ city: current.cidade ?? "", complement: current.complemento ?? "", district: current.bairro ?? "", number: current.numero ?? "", reference: current.referencia ?? "", state: current.estado ?? "", street: current.rua ?? "", zipCode: formatCep(current.cep ?? "") });
      })
      .catch(() => {});
  }, [open, session?.accessToken]);

  useEffect(() => {
    const digits = onlyDigits(address.zipCode);
    if (!open || digits.length !== 8) return undefined;
    const requestId = ++lookupRef.current;
    setLookingUp(true);
    setError("");
    fetchCepAddress(digits)
      .then((result) => {
        if (lookupRef.current !== requestId) return;
        setAddress((current) => ({ ...current, city: result.cidade || current.city, district: result.bairro || current.district, state: result.estado || current.state, street: result.rua || current.street, zipCode: formatCep(result.cep) }));
      })
      .catch((requestError) => { if (lookupRef.current === requestId) setError(requestError.message ?? "Nao foi possivel consultar o CEP."); })
      .finally(() => { if (lookupRef.current === requestId) setLookingUp(false); });
    return undefined;
  }, [address.zipCode, open]);

  function change(field, value) {
    setAddress((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function save() {
    const payload = { ...address, city: address.city.trim(), complement: address.complement.trim(), district: address.district.trim(), number: address.number.trim(), reference: address.reference.trim(), state: address.state.trim().toUpperCase(), street: address.street.trim(), zipCode: onlyDigits(address.zipCode) };
    if (payload.zipCode.length !== 8 || payload.street.length < 2 || !payload.number || payload.district.length < 2 || payload.city.length < 2 || payload.state.length !== 2) {
      setError("Confirme CEP, rua, numero, bairro, cidade e UF.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await updateCurrentUser(session.accessToken, { address: payload, location: { city: payload.city, state: payload.state } });
      updateSessionUser(response.user);
      onCompleted?.(response.user?.addresses?.[0] ?? payload);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel salvar o endereco.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={loading ? undefined : onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.backdrop}>
        <Pressable disabled={loading} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.header}><View style={styles.icon}><Ionicons color={colors.primaryDark} name="home-outline" size={22} /></View><View style={styles.copy}><Text style={styles.eyebrow}>SEM SAIR DESTA ETAPA</Text><Text style={styles.title}>Complete seu endereco</Text><Text style={styles.text}>Precisamos da sua cidade para {reason}. Preencha uma vez e o dado fica salvo na conta.</Text></View><Pressable disabled={loading} onPress={onClose} style={styles.close}><Ionicons color={colors.textPrimary} name="close" size={21} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            <View style={styles.cep}><AppInput autoComplete="postal-code" icon="navigate-outline" keyboardType="number-pad" label="CEP" maxLength={9} onChangeText={(value) => change("zipCode", formatCep(value))} placeholder="00000-000" value={address.zipCode} />{lookingUp ? <ActivityIndicator color={colors.primaryDark} style={styles.lookup} /> : null}</View>
            <AppInput autoCapitalize="words" icon="map-outline" label="Rua" onChangeText={(value) => change("street", value)} value={address.street} />
            <View style={styles.row}><AppInput containerStyle={styles.flex} icon="home-outline" label="Numero" onChangeText={(value) => change("number", value)} value={address.number} /><AppInput containerStyle={styles.flex} icon="business-outline" label="Bairro" onChangeText={(value) => change("district", value)} value={address.district} /></View>
            <View style={styles.row}><AppInput autoCapitalize="words" containerStyle={styles.flex} icon="location-outline" label="Cidade" onChangeText={(value) => change("city", value)} value={address.city} /><AppInput autoCapitalize="characters" containerStyle={styles.state} label="UF" maxLength={2} onChangeText={(value) => change("state", value.toUpperCase())} value={address.state} /></View>
            <AppInput icon="flag-outline" label="Referencia" onChangeText={(value) => change("reference", value)} placeholder="Opcional" value={address.reference} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton disabled={lookingUp} icon="checkmark-circle-outline" loading={loading} onPress={save} title="Salvar endereco e continuar" />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(8,24,18,0.46)", flex: 1, justifyContent: "flex-end" }, cep: { position: "relative" }, close: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 }, copy: { flex: 1, gap: 3 }, error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption }, eyebrow: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9 }, flex: { flex: 1 }, form: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl }, header: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.lg }, icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 }, lookup: { bottom: 17, position: "absolute", right: 18 }, row: { flexDirection: "row", gap: spacing.sm }, sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", ...shadowSoft }, state: { width: 82 }, text: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 }, title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
});
