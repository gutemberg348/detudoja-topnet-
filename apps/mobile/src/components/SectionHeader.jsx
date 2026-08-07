import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, fonts, spacing, typography } from "../utils/theme";

export function SectionHeader({ actionLabel, onAction, subtitle, title }) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable hitSlop={10} onPress={onAction} style={styles.actionButton}>
          <Text style={styles.action}>{actionLabel}</Text>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  actionButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minHeight: 40,
    paddingLeft: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
});
