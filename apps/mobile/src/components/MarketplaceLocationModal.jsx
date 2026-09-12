import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchCepAddress } from "../services/cep.api";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";

const stateCodes = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 8);
}

function formatCep(value = "") {
  const digits = onlyDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function stateCode(value = "") {
  const normalized = normalizeText(value);
  return normalized.length === 2
    ? normalized.toUpperCase()
    : stateCodes[normalized] ?? "";
}

export function MarketplaceLocationModal({ onConfirm, visible }) {
  const [cep, setCep] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [state, setState] = useState("");

  useEffect(() => {
    if (visible) {
      setError("");
    }
  }, [visible]);

  async function confirmLocation(nextLocation = { city, state }) {
    const nextState = stateCode(nextLocation.state);
    const nextCity = String(nextLocation.city ?? "").trim();

    if (nextCity.length < 2 || !/^[A-Z]{2}$/.test(nextState)) {
      setError("Informe a cidade e a UF para continuar.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onConfirm({ city: nextCity, state: nextState });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel salvar sua cidade.");
    } finally {
      setIsLoading(false);
    }
  }

  async function useCep() {
    if (onlyDigits(cep).length !== 8) {
      setError("Informe um CEP valido.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const address = await fetchCepAddress(cep);
      setCity(address.cidade);
      setState(address.estado);
      await onConfirm({ city: address.cidade, state: address.estado });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel localizar esse CEP.");
    } finally {
      setIsLoading(false);
    }
  }

  async function useCurrentLocation() {
    setIsLoading(true);
    setError("");

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        setError("Permita o acesso a localizacao ou informe sua cidade.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const nextCity = address?.city ?? address?.subregion ?? address?.district ?? "";
      const nextState = stateCode(address?.region ?? "");

      if (!nextCity || !nextState) {
        setError("Nao conseguimos identificar a cidade. Informe-a manualmente.");
        return;
      }

      setCity(nextCity);
      setState(nextState);
      await onConfirm({ city: nextCity, state: nextState });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel obter sua localizacao.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {}}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <View style={styles.iconShell}>
            <Ionicons color={colors.primaryDark} name="location-outline" size={28} />
          </View>
          <View style={styles.heading}>
            <Text style={styles.title}>Onde voce quer buscar?</Text>
            <Text style={styles.subtitle}>
              Precisamos apenas da cidade agora. O endereco completo sera pedido somente na compra.
            </Text>
          </View>

          <View style={styles.fields}>
            <View style={styles.cityRow}>
              <AppInput
                autoCapitalize="words"
                containerStyle={styles.cityInput}
                icon="business-outline"
                onChangeText={setCity}
                placeholder="Cidade"
                value={city}
              />
              <AppInput
                autoCapitalize="characters"
                containerStyle={styles.stateInput}
                maxLength={2}
                onChangeText={(value) => setState(value.toUpperCase())}
                placeholder="UF"
                value={state}
              />
            </View>
            <AppButton
              disabled={isLoading}
              onPress={() => confirmLocation()}
              title="Continuar com esta cidade"
            />
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.divider} />
          </View>

          <AppButton
            disabled={isLoading}
            icon="navigate-outline"
            onPress={useCurrentLocation}
            title="Usar minha localizacao"
            variant="outline"
          />

          <View style={styles.cepRow}>
            <AppInput
              containerStyle={styles.cepInput}
              icon="map-outline"
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={9}
              onChangeText={(value) => setCep(formatCep(value))}
              placeholder="Ou informe o CEP"
              value={cep}
            />
            <AppButton
              disabled={isLoading}
              onPress={useCep}
              style={styles.cepButton}
              title="Usar CEP"
              variant="neutral"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(4, 20, 13, 0.62)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    gap: spacing.lg,
    maxWidth: 460,
    padding: spacing.xl,
    width: "100%",
    ...shadow,
  },
  cepButton: { minHeight: 52, width: 112 },
  cepInput: { flex: 1 },
  cepRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  cityInput: { flex: 1 },
  cityRow: { flexDirection: "row", gap: spacing.sm },
  divider: { backgroundColor: colors.border, flex: 1, height: 1 },
  dividerRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  dividerText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: typography.caption },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  fields: { gap: spacing.sm },
  heading: { gap: spacing.sm },
  iconShell: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  stateInput: { width: 78 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800", textAlign: "center" },
});
