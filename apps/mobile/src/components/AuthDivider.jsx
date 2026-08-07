import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing, typography } from "../utils/theme";

export function AuthDivider({ label }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  line: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },
  wrapper: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
});
