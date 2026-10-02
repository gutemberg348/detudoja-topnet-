import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, StyleSheet, Text, View } from "react-native";
import { AppButton } from "./AppButton";
import { colors, fonts, radius, spacing } from "../utils/theme";

// Stack screens stay mounted after navigating away. Only the visible scanner
// may own the camera, including after returning from settings/background.
export function QrCamera({ onBarcodeScanned, height = 305 }) {
  const focused = useIsFocused();
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const askedRef = useRef(false);
  const active = focused && appActive && permission?.granted;

  useFocusEffect(useCallback(() => {
    let live = true;
    async function refresh() {
      try { await getPermission(); }
      catch { if (live) setError("Nao foi possivel verificar a permissao da camera."); }
    }
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state === "active") void refresh();
    });
    setAppActive(AppState.currentState === "active");
    return () => { live = false; subscription.remove(); };
  }, [getPermission]));

  const askPermission = useCallback(async () => {
    setRequesting(true);
    setError("");
    try { await requestPermission(); }
    catch { setError("Nao foi possivel pedir acesso a camera. Tente novamente."); }
    finally { setRequesting(false); }
  }, [requestPermission]);

  useEffect(() => {
    if (focused && appActive && permission?.status === "undetermined" && !askedRef.current) {
      askedRef.current = true;
      void askPermission();
    }
  }, [appActive, askPermission, focused, permission?.status]);

  useEffect(() => {
    setReady(false);
    setError("");
  }, [active, attempt]);

  useEffect(() => {
    if (!active || ready || error) return undefined;
    const timer = setTimeout(() => {
      setError("A camera nao iniciou. Confira se o acesso a camera esta ligado no celular e tente novamente.");
    }, 10000);
    return () => clearTimeout(timer);
  }, [active, attempt, error, ready]);

  async function openSettings() {
    try { await Linking.openSettings(); }
    catch { setError("Abra as configuracoes do celular e permita a camera para o Brasil Cashback."); }
  }

  async function retryCamera() {
    try {
      await getPermission();
      setAttempt((value) => value + 1);
    } catch {
      setError("Nao foi possivel verificar a permissao. Abra as configuracoes do celular.");
    }
  }

  if (!permission?.granted) {
    const blocked = permission?.canAskAgain === false;
    return (
      <View style={styles.permission}>
        <Ionicons color={colors.primaryDark} name="camera-outline" size={32} />
        <Text style={styles.title}>Camera para ler o QR</Text>
        <Text style={styles.description}>{blocked
          ? "O acesso foi bloqueado. Abra as configuracoes e permita o uso da camera."
          : "Permita usar a camera para ler o QR. Ela fica ligada apenas nesta tela."}</Text>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.description}>{error}</Text> : null}
        <AppButton loading={requesting || (!permission && !error)} icon={blocked ? "settings-outline" : "camera-outline"}
          onPress={blocked ? openSettings : askPermission} title={blocked ? "Abrir configuracoes" : "Permitir camera"} />
      </View>
    );
  }

  return (
    <View style={[styles.shell, { height }]}>
      {active ? <CameraView key={attempt} facing="back" mode="picture"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={ready && !error ? onBarcodeScanned : undefined}
        onCameraReady={() => { setReady(true); setError(""); }}
        onMountError={() => setError("Nao foi possivel abrir a camera. Confira a permissao e tente novamente.")}
        style={StyleSheet.absoluteFillObject} /> : null}
      {active && ready && !error ? <View pointerEvents="none" style={styles.frame}><View style={styles.corner} /></View> : null}
      {!ready || error ? <View accessibilityLiveRegion="polite" style={styles.status}>
        {error ? <Ionicons color={colors.card} name="camera-outline" size={28} /> : <ActivityIndicator color={colors.card} />}
        <Text style={styles.statusText}>{error || "Abrindo camera..."}</Text>
        {error ? <>
          <AppButton icon="refresh-outline" onPress={retryCamera} title="Tentar novamente" />
          <AppButton variant="neutral" icon="settings-outline" onPress={openSettings} title="Ver permissao da camera" />
        </> : null}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: "#102019", borderRadius: radius.lg, overflow: "hidden", position: "relative" },
  frame: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  corner: { borderColor: "#A7F3D0", borderRadius: radius.lg, borderWidth: 2, height: 192, width: 192 },
  status: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md, backgroundColor: "rgba(16,32,25,0.85)" },
  statusText: { color: colors.card, fontFamily: fonts.medium, textAlign: "center", lineHeight: 20 },
  permission: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 18 },
  description: { color: colors.textSecondary, fontFamily: fonts.regular, textAlign: "center", lineHeight: 20 },
});
