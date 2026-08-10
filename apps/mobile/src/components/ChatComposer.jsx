import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function ChatComposer({
  accessory = null,
  disabled = false,
  draft,
  leadingAction = null,
  maxLength = 2000,
  onChangeDraft,
  onFocus,
  onSend,
  placeholder,
  sendEnabled,
  sending = false,
  style,
  submitOnEnter = false,
}) {
  const hasContent = Boolean(String(draft ?? "").trim());
  const canSend = (sendEnabled ?? hasContent) && !disabled && !sending;

  return (
    <View style={[styles.composer, style]}>
      {accessory}
      <View style={styles.inputRow}>
        {leadingAction}
        <TextInput
          editable={!disabled}
          maxLength={maxLength}
          multiline
          onChangeText={onChangeDraft}
          onFocus={onFocus}
          onSubmitEditing={submitOnEnter ? onSend : undefined}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={draft}
        />
        <Pressable
          accessibilityLabel="Enviar mensagem"
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [
            styles.send,
            !canSend && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.card} size="small" />
          ) : (
            <Ionicons color={colors.card} name="arrow-up" size={21} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    maxHeight: 92,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  inputRow: {
    alignItems: "flex-end",
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  pressed: { opacity: 0.84 },
  send: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  sendDisabled: { backgroundColor: colors.textMuted },
});
