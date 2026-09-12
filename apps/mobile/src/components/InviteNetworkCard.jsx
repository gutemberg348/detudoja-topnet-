import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";

export function InviteNetworkCard({ code, message }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  async function shareInvite() {
    const inviteUrl = `detudoja://cadastro/convite/${encodeURIComponent(code)}`;

    await Share.share({
      message: `${message} Meu codigo de convite e ${code}. Abra no app: ${inviteUrl}`,
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconShell}>
          <Ionicons color={colors.primaryDark} name="send-outline" size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Convite para rede</Text>
          <Text style={styles.text}>{message}</Text>
        </View>
      </View>

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Código de convite</Text>
        <Text selectable style={styles.code}>
          {code}
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton
          icon={copied ? "checkmark" : "copy-outline"}
          onPress={copyCode}
          style={styles.actionButton}
          title={copied ? "Código copiado" : "Copiar código"}
          variant="outline"
        />
        <AppButton
          icon="share-social-outline"
          onPress={shareInvite}
          style={styles.actionButton}
          title="Compartilhar convite"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1,
    minWidth: 144,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    ...shadow,
  },
  code: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
    letterSpacing: 0,
  },
  codeBox: {
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  codeLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  iconShell: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  text: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
});
