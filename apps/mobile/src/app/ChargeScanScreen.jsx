import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

function normalizeChargeCode(value) {
  const rawValue = String(value ?? "").trim();
  const matched = rawValue.match(/DTJ:C:([A-Z0-9-]{8,64})/i);

  return (matched?.[1] ?? rawValue).trim().toUpperCase();
}

function normalizeStoreQrToken(value) {
  const rawValue = String(value ?? "").trim();
  const matched = rawValue.match(/DTJ:S:([A-Z0-9]{20,64})/i);

  return matched?.[1]?.toUpperCase() ?? null;
}

export function ChargeScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [hasRead, setHasRead] = useState(false);
  const [error, setError] = useState("");

  function openCharge(value) {
    const storeQrToken = normalizeStoreQrToken(value);
    if (storeQrToken) {
      navigation.navigate("ChargePayment", { storeQrToken });
      return;
    }
    const normalizedCode = normalizeChargeCode(value);

    if (normalizedCode.length < 8) {
      setError("Aponte a camera para um QR Brasil Cashback ou informe o codigo da cobranca.");
      return;
    }

    navigation.navigate("ChargePayment", { code: normalizedCode });
  }

  function handleBarcodeScanned({ data }) {
    if (hasRead) {
      return;
    }

    setHasRead(true);
    openCharge(data);
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons color={colors.primaryDark} name="scan-outline" size={25} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Pagar no local</Text>
          <Text style={styles.title}>Leia o QR da loja</Text>
          <Text style={styles.subtitle}>QR fixo ou cobranca: voce sempre confere a loja e o valor antes de pagar.</Text>
        </View>
      </View>

      {permission?.granted ? (
        <View style={styles.cameraShell}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={hasRead ? undefined : handleBarcodeScanned}
            style={styles.camera}
          />
          <View pointerEvents="none" style={styles.scanFrame}>
            <View style={styles.scanCorner} />
          </View>
        </View>
      ) : (
        <View style={styles.permissionCard}>
          <Ionicons color={colors.primaryDark} name="camera-outline" size={32} />
          <Text style={styles.permissionTitle}>Camera para ler o QR</Text>
          <Text style={styles.permissionText}>A camera e usada apenas para identificar a loja ou cobranca que voce esta pagando.</Text>
          <AppButton icon="camera-outline" onPress={requestPermission} title="Permitir camera" />
        </View>
      )}

      <View style={styles.manualCard}>
        <Text style={styles.manualTitle}>Ou informe o codigo</Text>
        <View style={styles.inputRow}>
          <Ionicons color={colors.textMuted} name="keypad-outline" size={20} />
          <TextInput
            autoCapitalize="characters"
            onChangeText={(value) => {
              setCode(value);
              setError("");
            }}
            placeholder="DTJ-..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={code}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => openCharge(code)} style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}>
          <Text style={styles.manualButtonText}>Continuar com codigo</Text>
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  cameraShell: { backgroundColor: "#102019", borderRadius: radius.lg, height: 305, overflow: "hidden", position: "relative" },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 3 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  input: { color: colors.textPrimary, flex: 1, fontFamily: fonts.medium, fontSize: typography.body, minWidth: 0, padding: 0 },
  inputRow: { alignItems: "center", borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  manualButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs },
  manualButtonText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  manualCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  manualTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  permissionCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.xl },
  permissionText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  permissionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  scanCorner: { borderColor: "#A7F3D0", borderRadius: radius.lg, borderWidth: 2, height: 192, width: 192 },
  scanFrame: { alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, fontWeight: "800" },
});
