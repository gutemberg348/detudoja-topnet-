import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function FriendQrScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasRead, setHasRead] = useState(false);
  const [error, setError] = useState("");

  async function handleCode(rawValue) {
    if (hasRead) return;
    const value = String(rawValue ?? "").trim();

    if (!/^DTJ:FRIEND:/i.test(value) && !/^detudoja:\/\/friends\/add\?id=/i.test(value)) {
      setError("Este QR nao pertence a um contato do Brasil Cashback.");
      setHasRead(true);
      return;
    }

    setHasRead(true);
    setError("");
    navigation.navigate("PersonalChatsInbox", { scannedPublicId: value });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons color={colors.primaryDark} name="person-add-outline" size={25} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Nova mensagem</Text>
          <Text style={styles.title}>Leia o QR</Text>
          <Text style={styles.subtitle}>Depois de ler, escreva a primeira mensagem e a conversa abre na hora.</Text>
        </View>
      </View>

      {permission?.granted ? (
        <View style={styles.cameraShell}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={hasRead ? undefined : ({ data }) => handleCode(data)}
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
          <Text style={styles.permissionText}>A camera e usada somente durante a leitura.</Text>
          <AppButton icon="camera-outline" onPress={requestPermission} title="Permitir camera" />
        </View>
      )}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => { setHasRead(false); setError(""); }} title="Ler novamente" variant="outline" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  cameraShell: { backgroundColor: "#102019", borderRadius: radius.lg, height: 330, overflow: "hidden", position: "relative" },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption, textAlign: "center" },
  errorCard: { gap: spacing.md },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 3 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  permissionCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.xl },
  permissionText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, textAlign: "center" },
  permissionTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3 },
  scanCorner: { borderColor: "#A7F3D0", borderRadius: radius.lg, borderWidth: 2, height: 210, width: 210 },
  scanFrame: { alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2 },
});
