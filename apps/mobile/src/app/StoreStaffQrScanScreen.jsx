import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { acceptStoreStaffInvitation } from "../services/seller.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function StoreStaffQrScanScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acceptedStore, setAcceptedStore] = useState(null);

  async function accept(rawValue) {
    if (busy || acceptedStore) return;
    const value = String(rawValue ?? "").trim();
    if (!/^BRASIL_CASHBACK:STORE_STAFF:/i.test(value) && !/^detudoja:\/\/funcionario\/aceitar\?token=/i.test(value)) {
      setError("Este QR nao e um convite de funcionario do Brasil Cashback.");
      setBusy(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await acceptStoreStaffInvitation(session.accessToken, { token: value });
      setAcceptedStore(response.store);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel aceitar este convite.");
    }
  }

  useEffect(() => {
    if (route.params?.token) void accept(route.params.token);
  }, [route.params?.token]);

  if (acceptedStore) {
    return (
      <ScreenContainer contentContainerStyle={styles.success} edges={["left", "right", "bottom"]}>
        <View style={styles.successIcon}><Ionicons color={colors.card} name="checkmark" size={36} /></View>
        <Text style={styles.title}>Acesso liberado</Text>
        <Text style={styles.subtitle}>Agora voce e atendente da {acceptedStore.name}. Sua conta pessoal continua normal.</Text>
        <AppButton
          icon="chatbubbles-outline"
          onPress={() => navigation.replace("StoreChatsInbox", { scope: "seller", store: acceptedStore, storeId: acceptedStore.id })}
          title="Entrar no atendimento"
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Ionicons color={colors.primaryDark} name="storefront-outline" size={25} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Perfil profissional</Text>
          <Text style={styles.title}>Ler convite da loja</Text>
          <Text style={styles.subtitle}>Aponte para o QR exibido pelo dono. Voce vera a loja antes de entrar no atendimento.</Text>
        </View>
      </View>
      {permission?.granted ? (
        <View style={styles.cameraShell}>
          <CameraView barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy ? undefined : ({ data }) => accept(data)} style={styles.camera} />
          <View pointerEvents="none" style={styles.scanFrame}><View style={styles.scanCorner} /></View>
        </View>
      ) : (
        <View style={styles.permissionCard}>
          <Ionicons color={colors.primaryDark} name="camera-outline" size={32} />
          <Text style={styles.permissionTitle}>Permitir camera</Text>
          <Text style={styles.permissionText}>A camera e usada apenas para ler o convite.</Text>
          <AppButton icon="camera-outline" onPress={requestPermission} title="Abrir camera" />
        </View>
      )}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => { setBusy(false); setError(""); }} title="Ler novamente" variant="outline" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  cameraShell: { backgroundColor: "#102019", borderRadius: radius.xl, height: 340, overflow: "hidden", position: "relative" },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption, textAlign: "center" },
  errorCard: { gap: spacing.md },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 4 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  permissionCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.xl, gap: spacing.md, padding: spacing.xl },
  permissionText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, textAlign: "center" },
  permissionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3 },
  scanCorner: { borderColor: "#A7F3D0", borderRadius: radius.lg, borderWidth: 3, height: 220, width: 220 },
  scanFrame: { alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  success: { alignItems: "center", flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.xl },
  successIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 70, justifyContent: "center", width: 70 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, textAlign: "center" },
});
