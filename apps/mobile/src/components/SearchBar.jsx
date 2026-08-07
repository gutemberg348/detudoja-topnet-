import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function SearchBar({
  compact = false,
  containerStyle,
  onChangeText,
  onSelectSuggestion,
  onSubmit,
  placeholder = "Buscar produtos, serviços ou categorias",
  showVoice = false,
  suggestions = [],
  value = "",
}) {
  const [focused, setFocused] = useState(false);
  const blurTimeoutRef = useRef(null);
  const visibleSuggestions = focused && value.trim() && suggestions.length > 0;

  useEffect(() => () => clearBlurTimeout(), []);

  function clearBlurTimeout() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }

  function openSuggestions() {
    clearBlurTimeout();
    setFocused(true);
  }

  function closeSuggestionsSoon() {
    clearBlurTimeout();
    blurTimeoutRef.current = setTimeout(() => {
      setFocused(false);
    }, 180);
  }

  function selectSuggestion(suggestion) {
    const nextValue = suggestion.label ?? suggestion.name ?? String(suggestion);
    clearBlurTimeout();
    setFocused(false);
    const handled = onSelectSuggestion?.(suggestion);

    if (handled === true) {
      return;
    }

    onChangeText(nextValue);
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <View style={[
        styles.search,
        compact && styles.searchCompact,
        focused && styles.searchFocused,
      ]}>
        <Ionicons color={colors.textWeak} name="search-outline" size={25} />
        <TextInput
          accessibilityLabel="Pesquisar"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          onBlur={closeSuggestionsSoon}
          onChangeText={onChangeText}
          onFocus={openSuggestions}
          onSubmitEditing={() => onSubmit?.(value.trim())}
          placeholder={placeholder}
          placeholderTextColor={colors.textWeak}
          returnKeyType="search"
          style={[styles.input, compact && styles.inputCompact]}
          value={value}
        />
        {value ? (
          <Pressable
            accessibilityLabel="Limpar pesquisa"
            hitSlop={10}
            onPress={() => onChangeText("")}
          >
            <Ionicons color={colors.textWeak} name="close-circle" size={21} />
          </Pressable>
        ) : showVoice ? (
          <View accessibilityLabel="Busca por voz" style={styles.voiceIcon}>
            <Ionicons color={colors.primary} name="mic" size={25} />
          </View>
        ) : null}
      </View>

      {visibleSuggestions ? (
        <View
          onStartShouldSetResponder={() => true}
          style={[styles.suggestions, compact && styles.suggestionsCompact]}
        >
          <ScrollView
            contentContainerStyle={styles.suggestionsContent}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.suggestionsScroll}
          >
            {suggestions.map((suggestion) => {
              const key = suggestion.id ?? suggestion.label ?? suggestion.name;
              const label = suggestion.label ?? suggestion.name ?? String(suggestion);
              const meta = suggestion.description ?? suggestion.type ?? "";

              return (
                <Pressable
                  key={key}
                  onPress={() => selectSuggestion(suggestion)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    pressed && styles.suggestionPressed,
                  ]}
                >
                  <View style={styles.suggestionIcon}>
                    <Ionicons
                      color={colors.primaryDark}
                      name={suggestionIcon(suggestion.type)}
                      size={18}
                    />
                  </View>
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={1} style={styles.suggestionText}>
                      {label}
                    </Text>
                    {meta ? (
                      <Text numberOfLines={1} style={styles.suggestionMeta}>
                        {suggestionLabel(suggestion.type, meta)}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function suggestionIcon(type) {
  if (type === "category") {
    return "grid-outline";
  }

  if (type === "store") {
    return "storefront-outline";
  }

  if (type === "product") {
    return "bag-handle-outline";
  }

  if (type === "service") {
    return "briefcase-outline";
  }

  return "search";
}

function suggestionLabel(type, fallback) {
  if (type === "category") {
    return "Categoria";
  }

  if (type === "store") {
    return `Loja - ${fallback}`;
  }

  if (type === "product") {
    return `Produto - ${fallback}`;
  }

  if (type === "service") {
    return `Servico - ${fallback}`;
  }

  return fallback;
}

const styles = StyleSheet.create({
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.body,
    fontWeight: "500",
    minHeight: 64,
  },
  inputCompact: { minHeight: 50 },
  search: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.xl,
    ...shadow,
  },
  searchFocused: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  searchCompact: {
    borderRadius: radius.lg,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  suggestion: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  suggestionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  suggestionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  suggestionMeta: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  suggestionPressed: {
    backgroundColor: colors.primarySoft,
  },
  suggestionText: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  suggestions: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 18,
    left: 0,
    marginTop: spacing.sm,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 68,
    zIndex: 1000,
    ...shadow,
  },
  suggestionsContent: {
    paddingVertical: spacing.xs,
  },
  suggestionsCompact: { top: 54 },
  suggestionsScroll: {
    maxHeight: 252,
  },
  wrapper: {
    maxWidth: 540,
    position: "relative",
    width: "100%",
    zIndex: 100,
  },
  voiceIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});
