import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { serviceIconName } from "../../utils/service-icons";
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
  vehicleKind: "MOTO",
};

const emptyAccountAddress = {
  city: "",
  complement: "",
  district: "",
  number: "",
  reference: "",
  state: "",
  street: "",
  zipCode: "",
};

const vehicleLabels = {
  BICICLETA: "Bicicleta",
  CAMINHAO: "Caminhao",
  CARRO: "Carro",
  MOTO: "Moto",
  UTILITARIO: "Utilitario / van",
};

export function CourierRegistrationModal({ accountAddress, error, loading, onClose, onSubmit, open, profile, service }) {
  const [form, setForm] = useState(emptyForm);
  const [address, setAddress] = useState(emptyAccountAddress);
  const [addressError, setAddressError] = useState("");
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const cepLookupRef = useRef(0);
  const requirements = service?.registrationRequirements ?? {
    requiresDriverLicense: true,
    requiresPlate: true,
    requiresVehicle: true,
    vehicleKinds: ["MOTO"],
  };
  const isCourierProfile = service?.requiresCourierProfile ?? true;
  const vehicleKinds = requirements.vehicleKinds?.length ? requirements.vehicleKinds : ["MOTO", "CARRO", "UTILITARIO", "CAMINHAO", "BICICLETA"];
  const needsAccountAddress = !accountAddress?.complete;

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
      vehicleKind: service?.registrationData?.vehicleKind ?? vehicleKinds[0] ?? "MOTO",
    } : {
      ...emptyForm,
      baseCity: accountAddress?.cidade ?? accountAddress?.city ?? "",
      baseState: accountAddress?.estado ?? accountAddress?.state ?? "",
      color: service?.registrationData?.color ?? "",
      driverLicense: service?.registrationData?.driverLicense ?? "",
      plate: service?.registrationData?.plate ?? "",
      vehicleKind: service?.registrationData?.vehicleKind ?? vehicleKinds[0] ?? "MOTO",
      vehicleModel: service?.registrationData?.vehicleModel ?? "",
    });
    setAddress({
      city: accountAddress?.cidade ?? accountAddress?.city ?? "",
      complement: accountAddress?.complemento ?? accountAddress?.complement ?? "",
      district: accountAddress?.bairro ?? accountAddress?.district ?? "",
      number: accountAddress?.numero ?? accountAddress?.number ?? "",
      reference: accountAddress?.referencia ?? accountAddress?.reference ?? "",
      state: accountAddress?.estado ?? accountAddress?.state ?? "",
      street: accountAddress?.rua ?? accountAddress?.street ?? "",
      zipCode: formatCep(accountAddress?.cep ?? accountAddress?.zipCode ?? ""),
    });
    setAddressError("");
  }, [accountAddress, open, profile, service]);

  useEffect(() => {
    const digits = onlyDigits(address.zipCode);
    if (!open || !needsAccountAddress || digits.length !== 8) return undefined;
    const requestId = cepLookupRef.current + 1;
    cepLookupRef.current = requestId;
    setLookingUpCep(true);
    setAddressError("");
    fetchCepAddress(digits)
      .then((result) => {
        if (cepLookupRef.current !== requestId) return;
        setAddress((current) => ({
          ...current,
          city: result.cidade || current.city,
          district: result.bairro || current.district,
          state: result.estado || current.state,
          street: result.rua || current.street,
          zipCode: formatCep(result.cep),
        }));
      })
      .catch((requestError) => {
        if (cepLookupRef.current === requestId) setAddressError(requestError.message ?? "Nao foi possivel consultar o CEP.");
      })
      .finally(() => {
        if (cepLookupRef.current === requestId) setLookingUpCep(false);
      });
    return undefined;
  }, [address.zipCode, needsAccountAddress, open]);

  const addressValid = !needsAccountAddress || (
    onlyDigits(address.zipCode).length === 8
    && address.street.trim().length >= 2
    && address.number.trim().length >= 1
    && address.district.trim().length >= 2
    && address.city.trim().length >= 2
    && address.state.trim().length === 2
  );

  const valid = useMemo(() => (
    (!isCourierProfile || (
      form.displayName.trim().length >= 2
      && form.contactPhone.replace(/\D/g, "").length >= 10
      && form.baseCity.trim().length >= 2
      && form.baseState.trim().length === 2
      && Number(form.serviceRadiusKm) >= 1
    ))
    && (!requirements.requiresDriverLicense || form.driverLicense.replace(/\D/g, "").length === 11)
    && (!requirements.requiresPlate || form.plate.replace(/[^a-z0-9]/gi, "").length === 7)
    && (!requirements.requiresVehicle || (
      vehicleKinds.includes(form.vehicleKind)
      && form.vehicleModel.trim().length >= 2
      && form.color.trim().length >= 2
    ))
    && addressValid
  ), [addressValid, form, isCourierProfile, requirements, vehicleKinds]);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeAddress(key, value) {
    setAddress((current) => ({ ...current, [key]: value }));
    setAddressError("");
  }

  function submit() {
    onSubmit({
      ...form,
      accountAddress: needsAccountAddress ? {
        ...address,
        city: address.city.trim(),
        complement: address.complement.trim(),
        district: address.district.trim(),
        number: address.number.trim(),
        reference: address.reference.trim(),
        state: address.state.trim().toUpperCase(),
        street: address.street.trim(),
        zipCode: onlyDigits(address.zipCode),
      } : null,
      serviceRadiusKm: Number(form.serviceRadiusKm),
    });
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.primaryDark} name={serviceIconName(service?.iconName, "navigate-outline")} size={24} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>CADASTRO DO SERVICO</Text>
              <Text style={styles.title}>{profile && !service ? "Dados de transporte" : `Realizar ${service?.name ?? "Corridas"}`}</Text>
              <Text style={styles.subtitle}>Preencha somente o que este servico exige para liberar sua disponibilidade.</Text>
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
            {isCourierProfile ? <><AppInput autoCapitalize="words" icon="person-outline" label="Nome profissional" onChangeText={(value) => change("displayName", value)} placeholder="Como as lojas verao o seu nome" value={form.displayName} /><AppInput icon="call-outline" keyboardType="phone-pad" label="Telefone de contato" maxLength={16} onChangeText={(value) => change("contactPhone", value)} placeholder="(83) 99999-9999" value={form.contactPhone} /></> : null}
            {requirements.requiresVehicle ? <View style={styles.vehicleKinds}>{vehicleKinds.map((kind) => <Pressable key={kind} onPress={() => change("vehicleKind", kind)} style={[styles.vehicleKind, form.vehicleKind === kind && styles.vehicleKindActive]}><Ionicons color={form.vehicleKind === kind ? colors.card : colors.primaryDark} name={kind === "MOTO" || kind === "BICICLETA" ? "bicycle-outline" : "car-outline"} size={18} /><Text style={[styles.vehicleKindText, form.vehicleKind === kind && styles.vehicleKindTextActive]}>{vehicleLabels[kind] ?? kind}</Text></Pressable>)}</View> : null}
            {requirements.requiresDriverLicense ? <AppInput icon="card-outline" keyboardType="number-pad" label="CNH" maxLength={14} onChangeText={(value) => change("driverLicense", value.replace(/\D/g, ""))} placeholder="11 digitos" value={form.driverLicense} /> : null}
            {requirements.requiresPlate || requirements.requiresVehicle ? <View style={styles.row}>{requirements.requiresPlate ? <AppInput autoCapitalize="characters" containerStyle={styles.rowField} icon="barcode-outline" label="Placa" maxLength={8} onChangeText={(value) => change("plate", value.toUpperCase())} placeholder="ABC1D23" value={form.plate} /> : null}{requirements.requiresVehicle ? <AppInput autoCapitalize="words" containerStyle={styles.rowField} icon="color-palette-outline" label="Cor" onChangeText={(value) => change("color", value)} placeholder="Preta" value={form.color} /> : null}</View> : null}
            {requirements.requiresVehicle ? <AppInput autoCapitalize="words" icon={form.vehicleKind === "MOTO" ? "bicycle-outline" : "car-outline"} label="Modelo do veiculo" onChangeText={(value) => change("vehicleModel", value)} placeholder={form.vehicleKind === "MOTO" ? "Ex.: Honda CG 160" : "Ex.: Fiat Fiorino"} value={form.vehicleModel} /> : null}
            {isCourierProfile ? <><View style={styles.row}><AppInput autoCapitalize="words" containerStyle={styles.cityField} icon="location-outline" label="Cidade base" onChangeText={(value) => change("baseCity", value)} placeholder="Patos" value={form.baseCity} /><AppInput autoCapitalize="characters" containerStyle={styles.stateField} label="UF" maxLength={2} onChangeText={(value) => change("baseState", value.toUpperCase())} placeholder="PB" value={form.baseState} /></View><AppInput icon="navigate-outline" keyboardType="number-pad" label="Raio de atendimento" maxLength={3} onChangeText={(value) => change("serviceRadiusKm", value.replace(/\D/g, ""))} placeholder="10 km" value={form.serviceRadiusKm} /></> : null}
            {needsAccountAddress ? (
              <View style={styles.addressSection}>
                <View style={styles.addressHeader}>
                  <View style={styles.addressIcon}><Ionicons color={colors.primaryDark} name="home-outline" size={19} /></View>
                  <View style={styles.headerCopy}>
                    <Text style={styles.addressTitle}>Complete seu endereco aqui</Text>
                    <Text style={styles.addressText}>Ele define sua cidade de atendimento e fica salvo na conta. Nao precisa sair desta tela.</Text>
                  </View>
                </View>
                <View style={styles.cepField}>
                  <AppInput autoComplete="postal-code" icon="navigate-outline" keyboardType="number-pad" label="CEP da conta" maxLength={9} onChangeText={(value) => changeAddress("zipCode", formatCep(value))} placeholder="00000-000" value={address.zipCode} />
                  {lookingUpCep ? <ActivityIndicator color={colors.primaryDark} style={styles.cepLoading} /> : null}
                </View>
                <AppInput autoCapitalize="words" icon="map-outline" label="Rua" onChangeText={(value) => changeAddress("street", value)} value={address.street} />
                <View style={styles.row}><AppInput containerStyle={styles.rowField} icon="home-outline" label="Numero" onChangeText={(value) => changeAddress("number", value)} value={address.number} /><AppInput containerStyle={styles.rowField} icon="business-outline" label="Bairro" onChangeText={(value) => changeAddress("district", value)} value={address.district} /></View>
                <View style={styles.row}><AppInput autoCapitalize="words" containerStyle={styles.cityField} icon="location-outline" label="Cidade" onChangeText={(value) => changeAddress("city", value)} value={address.city} /><AppInput autoCapitalize="characters" containerStyle={styles.stateField} label="UF" maxLength={2} onChangeText={(value) => changeAddress("state", value.toUpperCase())} value={address.state} /></View>
                <AppInput autoCapitalize="sentences" icon="flag-outline" label="Referencia" onChangeText={(value) => changeAddress("reference", value)} placeholder="Opcional" value={address.reference} />
                {addressError ? <Text style={styles.error}>{addressError}</Text> : null}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <AppButton disabled={loading} onPress={onClose} style={styles.action} title="Agora nao" variant="neutral" />
              <AppButton disabled={!valid || lookingUpCep} icon="checkmark-circle-outline" loading={loading} onPress={submit} style={styles.action} title={profile && !service ? "Salvar dados" : "Cadastrar e ativar"} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  addressHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  addressIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  addressSection: { backgroundColor: colors.backgroundSoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  addressText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  addressTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  cityField: { flex: 1 },
  cepField: { position: "relative" },
  cepLoading: { bottom: 16, position: "absolute", right: 16 },
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
  vehicleKind: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  vehicleKindActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  vehicleKinds: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  vehicleKindText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  vehicleKindTextActive: { color: colors.card },
});
