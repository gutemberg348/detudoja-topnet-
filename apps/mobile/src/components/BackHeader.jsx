import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function BackHeader({
  compact = false,
  color = colors.primaryDark,
  onPress,
  showTitle = true,
  style,
  title = "Voltar",
  titleStyle,
}) {
  return (
    <Pressable
      accessibilityLabel={title || "Voltar"}
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={color} name="chevron-back" size={20} style={styles.icon} />
      {showTitle ? (
        <Text
          numberOfLines={1}
          style={[styles.title, { color }, titleStyle]}
        >
          {title}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderColor: "#BDEFD0",
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: 2,
    minHeight: 36,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
  },
  buttonCompact: {
    alignSelf: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    height: 38,
    minHeight: 38,
    paddingHorizontal: 0,
    width: 38,
  },
  icon: {
    marginLeft: -2,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
});
