import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
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
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";

const emptyForm = {
  baseCity: "",
  baseState: "",
  color: "",
  contactPhone: "",
  displayName: "",
  driverLicense: "",
  plate: "",
  serviceRadiusKm: "10",
  vehicleModel: "",
};

export function CourierRegistrationModal({ error, loading, onClose, onSubmit, open, profile }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(profile ? {
      baseCity: profile.baseCity ?? "",
      baseState: profile.baseState ?? "",
      color: profile.color ?? "",
      contactPhone: profile.contactPhone ?? "",
      displayName: profile.displayName ?? "",
      driverLicense: profile.driverLicense ?? "",
      plate: profile.plate ?? "",
      serviceRadiusKm: String(profile.serviceRadiusKm ?? 10),
      vehicleModel: profile.vehicleModel ?? "",
    } : emptyForm);
  }, [open, profile]);

  const valid = useMemo(() => (
    form.displayName.trim().length >= 2
    && form.contactPhone.replace(/\D/g, "").length >= 10
    && form.driverLicense.replace(/\D/g, "").length === 11
    && form.plate.replace(/[^a-z0-9]/gi, "").length === 7
    && form.vehicleModel.trim().length >= 2
    && form.color.trim().length >= 2
    && form.baseCity.trim().length >= 2
    && form.baseState.trim().length === 2
    && Number(form.serviceRadiusKm) >= 1
  ), [form]);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.primaryDark} name="bicycle-outline" size={24} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>PERFIL DE ENTREGA</Text>
              <Text style={styles.title}>{profile ? "Dados do motoboy" : "Cadastre-se como motoboy"}</Text>
              <Text style={styles.subtitle}>Seus dados identificam voce para as lojas antes de cada corrida.</Text>
            </View>
            <Pressable accessibilityLabel="Fechar cadastro" onPress={onClose} style={styles.close}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.securityStrip}>
              <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={19} />
              <Text style={styles.securityText}>O CPF confirmado na sua conta sera usado neste cadastro.</Text>
            </View>
            <AppInput autoCapitalize="words" icon="person-outline" label="Nome profissional" onChangeText={(value) => change("displayName", value)} placeholder="Como as lojas verao o seu nome" value={form.displayName} />
            <AppInput icon="call-outline" keyboardType="phone-pad" label="Telefone de contato" maxLength={16} onChangeText={(value) => change("contactPhone", value)} placeholder="(83) 99999-9999" value={form.contactPhone} />
            <AppInput icon="card-outline" keyboardType="number-pad" label="CNH" maxLength={14} onChangeText={(value) => change("driverLicense", value.replace(/\D/g, ""))} placeholder="11 digitos" value={form.driverLicense} />
            <View style={styles.row}>
              <AppInput autoCapitalize="characters" containerStyle={styles.rowField} icon="barcode-outline" label="Placa" maxLength={8} onChangeText={(value) => change("plate", value.toUpperCase())} placeholder="ABC1D23" value={form.plate} />
              <AppInput autoCapitalize="words" containerStyle={styles.rowField} icon="color-palette-outline" label="Cor" onChangeText={(value) => change("color", value)} placeholder="Preta" value={form.color} />
            </View>
            <AppInput autoCapitalize="words" icon="bicycle-outline" label="Modelo da moto" onChangeText={(value) => change("vehicleModel", value)} placeholder="Ex.: Honda CG 160" value={form.vehicleModel} />
            <View style={styles.row}>
              <AppInput autoCapitalize="words" containerStyle={styles.cityField} icon="location-outline" label="Cidade base" onChangeText={(value) => change("baseCity", value)} placeholder="Patos" value={form.baseCity} />
              <AppInput autoCapitalize="characters" containerStyle={styles.stateField} label="UF" maxLength={2} onChangeText={(value) => change("baseState", value.toUpperCase())} placeholder="PB" value={form.baseState} />
            </View>
            <AppInput icon="navigate-outline" keyboardType="number-pad" label="Raio de atendimento" maxLength={3} onChangeText={(value) => change("serviceRadiusKm", value.replace(/\D/g, ""))} placeholder="10 km" value={form.serviceRadiusKm} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <AppButton disabled={loading} onPress={onClose} style={styles.action} title="Agora nao" variant="neutral" />
              <AppButton disabled={!valid} icon="checkmark-circle-outline" loading={loading} onPress={() => onSubmit({ ...form, serviceRadiusKm: Number(form.serviceRadiusKm) })} style={styles.action} title={profile ? "Salvar dados" : "Cadastrar e ficar online"} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  cityField: { flex: 1 },
  close: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  form: { gap: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radius.round, height: 4, marginBottom: spacing.md, width: 42 },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  headerCopy: { flex: 1, gap: 3, minWidth: 0 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
  overlay: { backgroundColor: "rgba(20,32,25,0.42)", flex: 1, justifyContent: "flex-end" },
  row: { flexDirection: "row", gap: spacing.sm },
  rowField: { flex: 1 },
  stateField: { width: 84 },
  securityStrip: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  securityText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 17 },
  sheet: { alignSelf: "center", backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "94%", maxWidth: 560, padding: spacing.lg, width: "100%", ...shadowSoft },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
});
