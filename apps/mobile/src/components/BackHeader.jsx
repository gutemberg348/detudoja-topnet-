import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function BackHeader({
  color = colors.primaryDark,
  onPress,
  style,
  title = "Voltar",
  titleStyle,
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={color} name="chevron-back" size={20} style={styles.icon} />
      <Text
        numberOfLines={1}
        style={[
          styles.title,
          { color },
          titleStyle,
        ]}
      >
        {title}
      </Text>
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
