import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getStoreSignupQr } from "../../services/seller.api";
import { colors, fonts, radius, shadow, spacing, typography } from "../../utils/theme";

export function StoreReferralModal({ accessToken, onClose, open, store }) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !store?.id || !accessToken) {
      return;
    }

    let active = true;
    setCopied("");
    setError("");
    setInvite(null);
    setLoading(true);

    getStoreSignupQr(accessToken, store.id)
      .then((response) => {
        if (active) setInvite(response);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message ?? "Nao foi possivel preparar o convite.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, open, store?.id]);

  async function copy(value, field) {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(field);
  }

  async function shareInvite() {
    if (!invite) return;

    try {
      await Share.share({
        message: invite.shareMessage,
        title: `Convite da ${invite.store?.name ?? store.name}`,
        url: invite.registrationUrl,
      });
    } catch {
      await copy(invite.registrationUrl, "link");
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons color={colors.primaryDark} name="people-outline" size={22} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>CADASTRO PELA LOJA</Text>
              <Text style={styles.title}>Convide novos clientes</Text>
              <Text style={styles.subtitle}>Quem entrar por aqui fica indicado pelo dono da loja.</Text>
            </View>
            <Pressable accessibilityLabel="Fechar convite" onPress={onClose} style={styles.close}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primaryDark} size="large" />
              <Text style={styles.loadingText}>Preparando QR e codigo...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons color={colors.danger} name="alert-circle-outline" size={24} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : invite ? (
            <>
              <View style={styles.inviteCard}>
                <View style={styles.qrFrame}>
                  <Image source={{ uri: invite.qrImageDataUrl }} style={styles.qr} />
                </View>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeLabel}>CODIGO DA LOJA</Text>
                  <Text selectable style={styles.code}>{invite.registrationCode}</Text>
                  <Text style={styles.codeHint}>Tambem pode ser digitado no campo de convite do cadastro.</Text>
                </View>
              </View>

              <Pressable onPress={shareInvite} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Ionicons color={colors.card} name="share-social-outline" size={20} />
                <Text style={styles.primaryText}>Compartilhar convite</Text>
              </Pressable>

              <View style={styles.quickActions}>
                <QuickAction
                  copied={copied === "code"}
                  icon="keypad-outline"
                  label="Copiar codigo"
                  onPress={() => copy(invite.registrationCode, "code")}
                />
                <QuickAction
                  copied={copied === "link"}
                  icon="link-outline"
                  label="Copiar link"
                  onPress={() => copy(invite.registrationUrl, "link")}
                />
              </View>

              <View style={styles.flowNote}>
                <Ionicons color={colors.primaryDark} name="phone-portrait-outline" size={20} />
                <Text style={styles.flowText}>
                  Com o app instalado, o link abre o cadastro. Sem o app, a pessoa pode criar a conta na pagina e usar o link de download.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function QuickAction({ copied, icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <Ionicons color={colors.primaryDark} name={copied ? "checkmark-circle" : icon} size={19} />
      <Text style={styles.quickActionText}>{copied ? "Copiado" : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(9, 24, 17, 0.5)", flex: 1, justifyContent: "flex-end" },
  close: { alignItems: "center", backgroundColor: "#F5F7F6", borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  code: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 24, fontWeight: "800" },
  codeBlock: { flex: 1, gap: 4, minWidth: 0 },
  codeHint: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  codeLabel: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  errorCard: { alignItems: "center", backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  errorText: { color: colors.danger, flex: 1, fontFamily: fonts.medium, fontSize: typography.small },
  eyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  flowNote: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  flowText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  handle: { alignSelf: "center", backgroundColor: colors.border, borderRadius: radius.round, height: 4, width: 44 },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  headerCopy: { flex: 1, gap: 3, minWidth: 0 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  inviteCard: { alignItems: "center", backgroundColor: "#F8FBF9", borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.lg, padding: spacing.md },
  loading: { alignItems: "center", gap: spacing.md, justifyContent: "center", minHeight: 260 },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  pressed: { opacity: 0.76 },
  primary: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 54, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.card, fontFamily: fonts.bold, fontSize: typography.body, fontWeight: "700" },
  qr: { height: 126, width: 126 },
  qrFrame: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, padding: 7 },
  quickAction: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.md },
  quickActionText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  quickActions: { flexDirection: "row", gap: spacing.sm },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "94%", ...shadow },
  sheetContent: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
});
