import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppButton } from "./AppButton";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function StatePanel({
  actionLabel,
  danger = false,
  icon = "information-circle-outline",
  loading = false,
  onAction,
  text,
  title,
}) {
  return (
    <View style={styles.panel}>
      <View style={[styles.icon, danger && styles.iconDanger]}>
        {loading ? (
          <ActivityIndicator color={colors.primaryDark} />
        ) : (
          <Ionicons color={danger ? colors.danger : colors.primaryDark} name={icon} size={23} />
        )}
      </View>
      <View style={styles.copy}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {text ? <Text style={styles.text}>{text}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <AppButton onPress={onAction} title={actionLabel} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { alignItems: "center", gap: spacing.xs },
  icon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  iconDanger: { backgroundColor: colors.dangerSoft },
  panel: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 132,
    padding: spacing.xl,
  },
  text: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
    maxWidth: 330,
    textAlign: "center",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
    textAlign: "center",
  },
});
