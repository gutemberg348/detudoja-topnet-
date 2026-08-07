import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

const variants = {
  danger: {
    button: { backgroundColor: colors.danger, borderColor: colors.danger },
    text: { color: colors.card },
  },
  ghost: {
    button: { backgroundColor: "transparent", borderColor: "transparent" },
    text: { color: colors.primaryDark },
  },
  neutral: {
    button: { backgroundColor: colors.card, borderColor: colors.border },
    text: { color: colors.textPrimary },
  },
  outline: {
    button: { backgroundColor: colors.card, borderColor: colors.primary },
    text: { color: colors.primaryDark },
  },
  primary: {
    button: { backgroundColor: colors.primary, borderColor: colors.primary },
    text: { color: colors.card },
  },
  secondary: {
    button: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primaryLight,
    },
    text: { color: colors.primaryDark },
  },
};

export function AppButton({
  disabled = false,
  icon,
  loading = false,
  onPress,
  style,
  title,
  variant = "primary",
}) {
  const selected = variants[variant] ?? variants.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected.button,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={selected.text.color} size="small" />
      ) : (
        <>
          {icon ? (
            <Ionicons color={selected.text.color} name={icon} size={18} />
          ) : null}
          <Text style={[styles.text, selected.text]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
  },
});
