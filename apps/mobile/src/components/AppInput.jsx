import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function AppInput({
  autoCapitalize = "none",
  containerStyle,
  error,
  icon,
  keyboardType = "default",
  label,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
  ...inputProps
}) {
  const [hidden, setHidden] = useState(secureTextEntry);
  const [focused, setFocused] = useState(false);
  const { onBlur, onFocus, ...restInputProps } = inputProps;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[
        styles.inputShell,
        focused && styles.inputShellFocused,
        error && styles.inputShellError,
      ]}>
        {icon ? (
          <View style={[styles.iconShell, focused && styles.iconShellFocused]}>
            <Ionicons
              color={focused ? colors.primaryDark : colors.textMuted}
              name={icon}
              size={18}
            />
          </View>
        ) : null}
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onChangeText={onChangeText}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          style={styles.input}
          value={value}
          {...restInputProps}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={hidden ? "Mostrar senha" : "Ocultar senha"}
            hitSlop={10}
            onPress={() => setHidden((current) => !current)}
          >
            <Ionicons
              color={colors.textSecondary}
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={20}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    minHeight: 46,
    paddingVertical: spacing.md,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  inputShellError: {
    borderColor: colors.danger,
  },
  inputShellFocused: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  iconShell: {
    alignItems: "center",
    borderRadius: radius.round,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  iconShellFocused: {
    backgroundColor: colors.primarySoft,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: typography.label,
    fontWeight: "600",
  },
  wrapper: {
    gap: spacing.sm,
    width: "100%",
  },
});
