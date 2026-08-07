import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "../utils/theme";

const tones = {
  neutral: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    iconColor: colors.textSecondary,
  },
  primary: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    iconColor: colors.card,
  },
  soft: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    iconColor: colors.primaryDark,
  },
};

export function IconButton({
  badge = false,
  disabled = false,
  icon,
  label,
  loading = false,
  onPress,
  size = 20,
  style,
  tone = "neutral",
}) {
  const selectedTone = tones[tone] ?? tones.neutral;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled || loading}
      hitSlop={8}
      onPress={onPress}
      title={label}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: selectedTone.backgroundColor,
          borderColor: selectedTone.borderColor,
        },
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={selectedTone.iconColor} size="small" />
      ) : (
        <Ionicons color={selectedTone.iconColor} name={icon} size={size} />
      )}
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.danger,
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    right: 5,
    top: 5,
    width: 10,
  },
  button: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    padding: spacing.xs,
    position: "relative",
    width: 42,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
