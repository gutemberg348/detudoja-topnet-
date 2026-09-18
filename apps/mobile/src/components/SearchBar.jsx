import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { serviceIconName } from "../utils/service-icons";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function SearchBar({
  compact = false,
  containerStyle,
  expandedSuggestions = false,
  initialSuggestionsTitle = "Sugestoes perto de voce",
  loading = false,
  onChangeText,
  onFocusChange,
  onSelectSuggestion,
  onSubmit,
  placeholder = "Buscar produtos, serviços ou categorias",
  showVoice = false,
  suggestions = [],
  value = "",
}) {
  const [focused, setFocused] = useState(false);
  const blurTimeoutRef = useRef(null);
  const { height: windowHeight } = useWindowDimensions();
  const visibleSuggestions = focused && (loading || suggestions.length > 0);
  const rowHeight = expandedSuggestions ? 78 : 68;
  const maximumListHeight = expandedSuggestions
    ? Math.min(390, Math.max(280, windowHeight * 0.46))
    : 244;
  const suggestionListHeight = Math.min(
    maximumListHeight,
    Math.max(rowHeight, suggestions.length * rowHeight),
  );

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
    onFocusChange?.(true);
  }

  function closeSuggestionsSoon() {
    clearBlurTimeout();
    blurTimeoutRef.current = setTimeout(() => {
      setFocused(false);
      onFocusChange?.(false);
    }, 180);
  }

  function selectSuggestion(suggestion) {
    const nextValue = suggestion.label ?? suggestion.name ?? String(suggestion);
    clearBlurTimeout();
    setFocused(false);
    onFocusChange?.(false);
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
          style={[styles.suggestions, compact && styles.suggestionsCompact]}
        >
          <View style={styles.suggestionsHeader}>
            <Text style={styles.suggestionsTitle}>
              {value.trim() ? "Resultados rapidos" : initialSuggestionsTitle}
            </Text>
            {loading ? <ActivityIndicator color={colors.primaryDark} size="small" /> : null}
          </View>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.suggestionsContent}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            overScrollMode="always"
            persistentScrollbar
            scrollEnabled={suggestions.length * rowHeight > maximumListHeight}
            showsVerticalScrollIndicator
            style={[styles.suggestionsScroll, { height: suggestionListHeight, maxHeight: maximumListHeight }]}
          >
            {suggestions.map((suggestion, index) => {
              const label = suggestion.label ?? suggestion.name ?? String(suggestion);
              const key = [
                suggestion.type ?? "result",
                suggestion.id ?? label,
                label,
              ].join(":");
              const meta = suggestion.description ?? suggestion.type ?? "";
              const visual = suggestionVisual(suggestion.type);
              const detail = suggestionDetail(suggestion.type, meta);

              return (
                <Pressable
                  key={key}
                  onPress={() => selectSuggestion(suggestion)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    index < suggestions.length - 1 && styles.suggestionDivider,
                    pressed && styles.suggestionPressed,
                  ]}
                >
                  <SuggestionArtwork suggestion={suggestion} visual={visual} />
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={2} style={styles.suggestionText}>
                      {label}
                    </Text>
                    <View style={styles.suggestionMetaRow}>
                      <View style={[styles.suggestionKind, { backgroundColor: visual.badgeBackground }]}>
                        <Text style={[styles.suggestionKindText, { color: visual.color }]}>
                          {suggestionTypeLabel(suggestion.type)}
                        </Text>
                      </View>
                      {detail ? <Text numberOfLines={1} style={styles.suggestionMeta}>{detail}</Text> : null}
                    </View>
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

function SuggestionArtwork({ suggestion, visual }) {
  const iconUrl = resolveMediaUrl(suggestion.iconUrl ?? suggestion.imageUrl);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [iconUrl]);

  return (
    <View style={[styles.suggestionIcon, { backgroundColor: visual.background }]}>
      {iconUrl && !imageFailed ? (
        <Image
          onError={() => setImageFailed(true)}
          resizeMode={["conversation", "product"].includes(suggestion.type) ? "cover" : "contain"}
          source={{ uri: iconUrl }}
          style={styles.suggestionImage}
        />
      ) : (
        <Ionicons
          color={visual.color}
          name={suggestionIcon(suggestion.type, suggestion.iconName)}
          size={20}
        />
      )}
    </View>
  );
}

function suggestionIcon(type, iconName) {
  if (type === "service") return serviceIconName(iconName);
  if (type === "category") {
    return "grid-outline";
  }

  if (type === "store") {
    return "storefront-outline";
  }

  if (type === "product") {
    return "bag-handle-outline";
  }

  if (type === "conversation") {
    return "chatbubble-ellipses-outline";
  }

  return "search";
}

function suggestionTypeLabel(type) {
  if (type === "category") {
    return "Categoria";
  }

  if (type === "store") {
    return "Loja";
  }

  if (type === "product") {
    return "Produto";
  }

  if (type === "service") {
    return "Servico";
  }

  if (type === "conversation") {
    return "Conversa";
  }

  return "Resultado";
}

function suggestionDetail(type, value) {
  if (!value || type === "category") {
    return "";
  }

  const parts = String(value)
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts[0]?.toLocaleLowerCase("pt-BR") === suggestionTypeLabel(type).toLocaleLowerCase("pt-BR")) {
    parts.shift();
  }

  return parts.join(" · ");
}

function suggestionVisual(type) {
  const visuals = {
    category: {
      background: colors.primarySoft,
      badgeBackground: "#DCFCE7",
      color: colors.primaryDark,
    },
    product: {
      background: "#FFF7E8",
      badgeBackground: "#FEF3C7",
      color: "#B45309",
    },
    service: {
      background: "#F3E8FF",
      badgeBackground: "#EDE9FE",
      color: "#7C3AED",
    },
    store: {
      background: "#EAF2FF",
      badgeBackground: "#DBEAFE",
      color: "#2563EB",
    },
    conversation: {
      background: colors.primarySoft,
      badgeBackground: "#D1FAE5",
      color: colors.primaryDark,
    },
  };

  const visual = visuals[type] ?? {
    background: colors.cardMuted,
    badgeBackground: colors.backgroundSoft,
    color: colors.textSecondary,
  };

  return visual;
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
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  suggestionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  suggestionDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  suggestionImage: { height: "100%", width: "100%" },
  suggestionKind: { borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 3 },
  suggestionKindText: { fontFamily: fonts.bold, fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  suggestionMeta: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 11,
    minWidth: 0,
  },
  suggestionMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0,
  },
  suggestionPressed: {
    backgroundColor: colors.primarySoft,
  },
  suggestionText: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20,
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
    paddingVertical: 2,
  },
  suggestionsHeader: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 36,
    paddingHorizontal: spacing.lg,
  },
  suggestionsTitle: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  suggestionsCompact: { top: 54 },
  suggestionsScroll: {
    maxHeight: 244,
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
