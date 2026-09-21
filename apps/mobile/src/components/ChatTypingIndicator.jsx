import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function ChatTypingIndicator({ visible }) {
  if (!visible) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.row}>
      <View style={styles.bubble}>
        <View style={styles.dots}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View>
        <Text style={styles.text}>digitando...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dot: { backgroundColor: colors.primary, borderRadius: radius.round, height: 5, width: 5 },
  dots: { flexDirection: "row", gap: 3 },
  row: { alignItems: "flex-start" },
  text: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
});
