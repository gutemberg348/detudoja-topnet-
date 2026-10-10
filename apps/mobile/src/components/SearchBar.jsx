import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { resolveMediaUrl } from "../utils/media";
import { serviceIconName } from "../utils/service-icons";
import { RecentConversationsCarousel } from "./RecentConversationsCarousel";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function SearchBar({
  compact = false,
  containerStyle,
  expandedSuggestions = false,
  fullscreen = false,
  initialSuggestionsTitle = "Sugestoes perto de voce",
  loading = false,
  onChangeText,
  onFocusChange,
  onSelectSuggestion,
  onSubmit,
  recentSuggestions = [],
  searchInfo = null,
  searchError = null,
  onRetrySuggestions,
  placeholder = "Buscar produtos, serviços ou categorias",
  showVoice = false,
  suggestions = [],
  value = "",
}) {
  const [focused, setFocused] = useState(false);
  const blurTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const { height: windowHeight } = useWindowDimensions();
  const visibleSuggestions = focused && (loading || searchError || suggestions.length > 0 || recentSuggestions.length > 0);
  const rowHeight = expandedSuggestions ? 82 : 72;
  const maximumListHeight = expandedSuggestions
    ? Math.min(390, Math.max(280, windowHeight * 0.46))
    : 244;
  const suggestionListHeight = Math.min(
    maximumListHeight,
    Math.max(rowHeight, suggestions.length * rowHeight),
  );
  // Fullscreen results share one scroll area, keeping the search header fixed.
  const SuggestionsList = fullscreen || expandedSuggestions ? View : ScrollView;
  const suggestionsListProps = fullscreen || expandedSuggestions ? { style: styles.suggestionsContent } : {
    bounces: false,
    contentContainerStyle: styles.suggestionsContent,
    keyboardShouldPersistTaps: "always",
    nestedScrollEnabled: true,
    showsVerticalScrollIndicator: true,
    style: [styles.suggestionsScroll, { height: suggestionListHeight, maxHeight: maximumListHeight }],
  };

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

  function closeSuggestions() {
    clearBlurTimeout();
    setFocused(false);
    onFocusChange?.(false);
    if (fullscreen) Keyboard.dismiss();
  }

  function selectSuggestion(suggestion) {
    const nextValue = suggestion.label ?? suggestion.name ?? String(suggestion);
    closeSuggestions();
    const handled = onSelectSuggestion?.(suggestion);

    if (handled === true) {
      return;
    }

    onChangeText(nextValue);
  }

  function renderSearchField(inScreen = false) {
    return (
      <View style={[
        styles.search,
        compact && styles.searchCompact,
        focused && styles.searchFocused,
        inScreen && styles.screenSearch,
      ]}>
        <Ionicons color={colors.textWeak} name="search-outline" size={25} />
        <TextInput
          accessibilityLabel="Pesquisar"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          onBlur={fullscreen ? undefined : closeSuggestionsSoon}
          onChangeText={onChangeText}
          onFocus={fullscreen ? undefined : openSuggestions}
          onSubmitEditing={() => {
            if (fullscreen) closeSuggestions();
            onSubmit?.(value.trim());
          }}
          placeholder={inScreen ? "Pesquisar" : placeholder}
          placeholderTextColor={colors.textWeak}
          returnKeyType="search"
          ref={inputRef}
          style={[styles.input, (compact || inScreen) && styles.inputCompact]}
          value={value}
        />
        {value && !inScreen ? (
          <Pressable
            accessibilityLabel="Limpar pesquisa"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChangeText("")}
          >
            <Ionicons color={colors.textWeak} name="close-circle" size={21} />
          </Pressable>
        ) : showVoice && !inScreen ? (
          <View accessibilityLabel="Busca por voz" style={styles.voiceIcon}>
            <Ionicons color={colors.primary} name="mic" size={25} />
          </View>
        ) : null}
      </View>
    );
  }

  function renderSuggestions(inScreen = false) {
    const suggestedTerms = searchInfo?.suggestedTerms ?? [];
    return (
        <View
          style={inScreen ? styles.screenSuggestions : [styles.suggestions, compact && styles.suggestionsCompact, expandedSuggestions && styles.suggestionsInline]}
        >
          {!value.trim() && recentSuggestions.length ? (
            <View style={styles.recentsSection}>
              <View style={styles.recentsHeading}>
                <Text style={styles.recentsTitle}>Conversas recentes</Text>
              </View>
              <RecentConversationsCarousel
                items={recentSuggestions.slice(0, 8)}
                onInteraction={clearBlurTimeout}
                onSelect={selectSuggestion}
                renderArtwork={(suggestion) => <SuggestionArtwork recent suggestion={suggestion} visual={suggestionVisual("conversation")} />}
              />
            </View>
          ) : null}
          {value.trim() && suggestedTerms.length ? (
            <View style={styles.corrections}>
              <Text style={styles.correctionLabel}>Você quis dizer?</Text>
              <View style={styles.correctionOptions}>
                {suggestedTerms.map((term) => (
                  <Pressable key={term} accessibilityRole="button" accessibilityLabel={`Pesquisar ${term}`}
                    onPress={() => { clearBlurTimeout(); onChangeText(term); inputRef.current?.focus(); }}
                    style={({ pressed }) => [styles.correctionChip, pressed && styles.suggestionPressed]}>
                    <Ionicons name="search-outline" size={14} color={colors.primaryDark} />
                    <Text style={styles.correctionTerm}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {searchInfo?.discovery && value.trim().length >= 2 ? (
            <Text style={styles.discoveryText}>Não encontramos esse termo. Explore estas opções na sua cidade:</Text>
          ) : null}
          {searchError ? (
            <Pressable accessibilityRole="button" onPress={onRetrySuggestions} style={styles.corrections}>
              <Text style={styles.correctionTerm}>Não foi possível atualizar as sugestões. Toque para tentar novamente.</Text>
            </Pressable>
          ) : null}
          {loading || suggestions.length ? (
            <View style={styles.suggestionsHeader}>
              <Text style={styles.suggestionsTitle}>
                {value.trim() && !searchInfo?.discovery ? "Resultados rapidos" : initialSuggestionsTitle}
              </Text>
              {loading ? <ActivityIndicator color={colors.primaryDark} size="small" /> : null}
            </View>
          ) : null}
          {suggestions.length ? <SuggestionsList {...suggestionsListProps}>
            {suggestions.map((suggestion) => {
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
                  accessibilityLabel={`Abrir ${label}`}
                  accessibilityRole="button"
                  key={key}
                  onPress={() => selectSuggestion(suggestion)}
                  style={({ pressed }) => [
                    styles.suggestion,
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
          </SuggestionsList> : null}
          {inScreen && !loading && !searchError && !suggestions.length && (value.trim() || !recentSuggestions.length) ? (
            <View style={styles.emptyState}>
              <Ionicons color={colors.textMuted} name="search-outline" size={32} />
              <Text style={styles.emptyTitle}>{value.trim().length >= 2 ? "Nenhum resultado por aqui" : "O que você está procurando?"}</Text>
              <Text style={styles.emptyText}>{value.trim().length >= 2 ? "Tente outro nome de produto, serviço ou loja." : "Digite pelo menos duas letras para encontrar produtos, serviços, lojas ou conversas."}</Text>
            </View>
          ) : null}
        </View>
    );
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {fullscreen ? (
        <Pressable
          accessibilityHint="Abre a busca em tela cheia"
          accessibilityLabel="Pesquisar"
          accessibilityRole="button"
          onPress={openSuggestions}
          style={({ pressed }) => [styles.search, pressed && styles.suggestionPressed]}
        >
          <Ionicons color={colors.textWeak} name="search-outline" size={25} />
          <Text numberOfLines={1} style={[styles.triggerText, !value && styles.triggerPlaceholder]}>{value || placeholder}</Text>
          {showVoice ? <View style={styles.voiceIcon}><Ionicons color={colors.primary} name="mic" size={25} /></View> : null}
        </Pressable>
      ) : renderSearchField()}
      {!fullscreen && visibleSuggestions ? renderSuggestions() : null}
      {fullscreen ? (
        <Modal
          animationType="fade"
          onRequestClose={closeSuggestions}
          onShow={() => inputRef.current?.focus()}
          presentationStyle="fullScreen"
          statusBarTranslucent
          navigationBarTranslucent
          visible={focused}
        >
          {/* A native Modal has its own view tree and needs its own inset provider. */}
          <SafeAreaProvider style={styles.screenSafeArea}>
            <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screenSafeArea}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.screenShell}>
                <View style={styles.screenHeader}>
                  <View style={styles.screenHeaderContent}>
                    <View style={styles.screenField}>{renderSearchField(true)}</View>
                    <Pressable
                      accessibilityHint="Fecha as sugestões e volta para a tela inicial"
                      accessibilityLabel="Fechar busca"
                      accessibilityRole="button"
                      onPress={closeSuggestions}
                      style={({ pressed }) => [styles.screenClose, pressed && styles.suggestionPressed]}
                    >
                      <Ionicons color={colors.textPrimary} name="close" size={27} />
                    </Pressable>
                  </View>
                </View>
                <ScrollView
                  contentContainerStyle={styles.screenScrollContent}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator
                  style={styles.screenScroll}
                >
                  {renderSuggestions(true)}
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </View>
  );
}

function SuggestionArtwork({ recent = false, suggestion, visual }) {
  const iconUrl = resolveMediaUrl(suggestion.iconUrl ?? suggestion.imageUrl);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [iconUrl]);

  return (
    <View style={[styles.suggestionIcon, recent && styles.recentAvatar, { backgroundColor: visual.background }]}>
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
          size={recent ? 26 : 20}
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
  corrections: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8 },
  correctionLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
  correctionOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  correctionChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 18,
    backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 9, minHeight: 44 },
  correctionTerm: { color: colors.primaryDark, fontSize: 13, fontFamily: fonts.medium, flexShrink: 1 },
  discoveryText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  emptyState: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: typography.body, textAlign: "center" },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  screenShell: { backgroundColor: colors.card, flex: 1 },
  screenSafeArea: { backgroundColor: colors.background, flex: 1 },
  screenHeader: { backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1 },
  screenHeaderContent: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: spacing.sm, maxWidth: 560, padding: spacing.lg, width: "100%" },
  screenField: { flex: 1, minWidth: 0 },
  screenSearch: { backgroundColor: colors.cardMuted, minHeight: 54, paddingHorizontal: spacing.md, gap: spacing.sm },
  screenClose: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  screenScroll: { flex: 1 },
  screenScrollContent: { alignItems: "center", flexGrow: 1, paddingBottom: spacing.xl },
  screenSuggestions: { maxWidth: 560, paddingTop: spacing.sm, width: "100%" },
  triggerText: { color: colors.textPrimary, flex: 1, fontFamily: fonts.medium, fontSize: typography.body, minWidth: 0 },
  triggerPlaceholder: { color: colors.textWeak },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.body,
    fontWeight: "500",
    minHeight: 64,
    ...Platform.select({ web: { outlineStyle: "none" } }),
  },
  inputCompact: { minHeight: 50 },
  recentAvatar: {
    borderColor: colors.border,
    borderWidth: 1,
    height: 64,
    width: 64,
  },
  recentsHeading: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  recentsSection: {
    paddingTop: spacing.xs,
  },
  recentsTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
  },
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
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    marginHorizontal: spacing.sm,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  suggestionIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  suggestionImage: { borderRadius: 999, height: "100%", width: "100%" },
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
    borderRadius: 24,
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
  suggestionsHeader: {
    alignItems: "center",
    backgroundColor: colors.card,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  suggestionsTitle: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  suggestionsCompact: { top: 54 },
  suggestionsInline: { position: "relative", top: 0, elevation: 0 },
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
