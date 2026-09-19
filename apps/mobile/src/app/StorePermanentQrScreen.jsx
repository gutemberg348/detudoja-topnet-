import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { getPermanentStorePaymentQr, regeneratePermanentStorePaymentQr } from "../services/seller.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function StorePermanentQrScreen({ route }) {
  const { session } = useAuthStore();
  const storeId = route.params?.store?.id ?? route.params?.storeId;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.accessToken || !storeId) return;
    setLoading(true);
    setError("");
    try {
      setData(await getPermanentStorePaymentQr(session.accessToken, storeId));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar o QR da loja.");
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, storeId]);

  useEffect(() => { load(); }, [load]);

  async function qrFile() {
    const base64 = data?.qrImageDataUrl?.split(",")[1];
    if (!base64) throw new Error("Imagem do QR indisponivel.");
    const uri = `${FileSystem.cacheDirectory}qr-pagamento-loja-${storeId}.png`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  }

  async function saveQr() {
    if (saving || !data) return;
    setSaving(true);
    try {
      if (Platform.OS === "web") {
        await Share.share({ message: data.store.payload, title: `QR de ${data.store.name}` });
      } else {
        const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
        if (!permission.granted) throw new Error("Permita o acesso as fotos para salvar o QR.");
        await MediaLibrary.saveToLibraryAsync(await qrFile());
        Alert.alert("QR salvo", "A imagem foi adicionada a sua galeria e ja pode ser impressa.");
      }
    } catch (saveError) {
      Alert.alert("Nao foi possivel salvar", saveError.message ?? "Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function shareQr() {
    if (!data) return;
    try {
      if (Platform.OS !== "web" && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(await qrFile(), {
          dialogTitle: `QR de pagamento - ${data.store.name}`,
          mimeType: "image/png",
          UTI: "public.png",
        });
      } else {
        await Share.share({
          message: `Pague ${data.store.name} pelo app Brasil Cashback. Codigo: ${data.store.payload}`,
          title: `QR de pagamento - ${data.store.name}`,
        });
      }
    } catch (shareError) {
      Alert.alert("Nao foi possivel compartilhar", shareError.message ?? "Tente novamente.");
    }
  }

  async function copyCode() {
    if (!data?.store?.payload) return;
    await Clipboard.setStringAsync(data.store.payload);
    Alert.alert("Codigo copiado", "O codigo do QR foi copiado.");
  }

  function confirmRegenerate() {
    Alert.alert(
      "Trocar o QR permanente?",
      "O QR antigo deixara de funcionar. Troque tambem qualquer placa ou impressao que estiver na loja.",
      [
        { style: "cancel", text: "Manter atual" },
        {
          style: "destructive",
          text: "Gerar novo",
          onPress: async () => {
            setLoading(true);
            setError("");
            try {
              setData(await regeneratePermanentStorePaymentQr(session.accessToken, storeId));
            } catch (requestError) {
              setError(requestError.message ?? "Nao foi possivel trocar o QR.");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primaryDark} size="large" /><Text style={styles.centerText}>Preparando QR permanente...</Text></View>;
  }
  if (!data) {
    return <View style={styles.center}><Ionicons color={colors.danger} name="alert-circle-outline" size={30} /><Text style={styles.centerText}>{error}</Text><AppButton icon="refresh-outline" onPress={load} title="Tentar novamente" /></View>;
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons color={colors.card} name="storefront-outline" size={27} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>RECEBIMENTO NO BALCAO</Text>
          <Text style={styles.title}>QR permanente</Text>
          <Text style={styles.subtitle}>Um unico QR para deixar impresso na {data.store.name}.</Text>
        </View>
      </View>

      <View style={styles.qrCard}>
        <View style={styles.activePill}><View style={styles.activeDot} /><Text style={styles.activeText}>PRONTO PARA RECEBER</Text></View>
        <View style={styles.qrFrame}><Image accessibilityLabel="QR permanente da loja" source={{ uri: data.qrImageDataUrl }} style={styles.qrImage} /></View>
        <Text style={styles.storeName}>{data.store.name}</Text>
        <Text style={styles.qrHelp}>O cliente lê, digita o valor e escolhe entre saldo + Pix ou somente Pix.</Text>
      </View>

      <View style={styles.actionRow}>
        <QrAction icon="download-outline" label="Baixar" loading={saving} onPress={saveQr} />
        <QrAction icon="share-social-outline" label="Compartilhar" onPress={shareQr} />
        <QrAction icon="copy-outline" label="Copiar codigo" onPress={copyCode} />
      </View>

      <View style={styles.flowCard}>
        <FlowStep icon="scan-outline" number="1" text="Cliente lê este QR no aplicativo." />
        <FlowStep icon="calculator-outline" number="2" text="Informa e confere o valor da compra." />
        <FlowStep icon="wallet-outline" number="3" text="Usa saldo se quiser e paga o restante no Pix." />
      </View>

      <View style={styles.securityNotice}>
        <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={22} />
        <Text style={styles.securityText}>Cada leitura cria uma cobrança nova e rastreável. Este QR não contém valor e não expira.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={confirmRegenerate} style={({ pressed }) => [styles.regenerate, pressed && styles.pressed]}>
        <Ionicons color={colors.danger} name="refresh-outline" size={18} />
        <Text style={styles.regenerateText}>Invalidar este QR e gerar outro</Text>
      </Pressable>
    </ScreenContainer>
  );
}

function QrAction({ icon, label, loading = false, onPress }) {
  return (
    <Pressable disabled={loading} onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={colors.primaryDark} size="small" /> : <Ionicons color={colors.primaryDark} name={icon} size={22} />}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function FlowStep({ icon, number, text }) {
  return (
    <View style={styles.flowStep}>
      <View style={styles.flowNumber}><Text style={styles.flowNumberText}>{number}</Text></View>
      <Ionicons color={colors.primaryDark} name={icon} size={20} />
      <Text style={styles.flowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: 82, padding: spacing.sm },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 11, fontWeight: "700", textAlign: "center" },
  activeDot: { backgroundColor: colors.success, borderRadius: radius.round, height: 8, width: 8 },
  activePill: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  activeText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 11, fontWeight: "700" },
  center: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  centerText: { color: colors.textSecondary, fontFamily: fonts.medium, textAlign: "center" },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  flowCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  flowNumber: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 24, justifyContent: "center", width: 24 },
  flowNumberText: { color: colors.card, fontFamily: fonts.bold, fontSize: 11, fontWeight: "700" },
  flowStep: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  flowText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19 },
  hero: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.xl, flexDirection: "row", gap: spacing.md, padding: spacing.xl, ...shadow },
  heroCopy: { flex: 1, gap: 3 },
  heroIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.lg, height: 54, justifyContent: "center", width: 54 },
  kicker: { color: "#A7F3D0", fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  qrCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.xl, borderWidth: 1, gap: spacing.md, padding: spacing.xl, ...shadow },
  qrFrame: { backgroundColor: "#FFFFFF", borderColor: colors.primaryLight, borderRadius: radius.xl, borderWidth: 1, padding: spacing.md },
  qrHelp: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, maxWidth: 320, textAlign: "center" },
  qrImage: { height: 250, width: 250 },
  regenerate: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: spacing.xs, padding: spacing.md },
  regenerateText: { color: colors.danger, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  securityNotice: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  securityText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19 },
  storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#D1FAE5", fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19 },
  title: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
});
