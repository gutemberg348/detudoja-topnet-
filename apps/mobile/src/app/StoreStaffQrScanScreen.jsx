import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { QrCamera } from "../components/QrCamera";
import { ScreenContainer } from "../components/ScreenContainer";
import { acceptStoreStaffInvitation } from "../services/seller.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function StoreStaffQrScanScreen({ navigation, route }) {
  const { session } = useAuthStore();
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
      <QrCamera height={340} onBarcodeScanned={busy ? undefined : ({ data }) => accept(data)} />
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
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption, textAlign: "center" },
  errorCard: { gap: spacing.md },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 4 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20 },
  success: { alignItems: "center", flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.xl },
  successIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 70, justifyContent: "center", width: 70 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, textAlign: "center" },
});
