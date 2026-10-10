import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { SearchBar } from "../components/SearchBar";
import { useMarketplaceSuggestions } from "../hooks/useMarketplaceSuggestions";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { readQueryKey } from "../services/read-cache";
import { realtimeEvents } from "../services/realtime";
import { getWalletOverview } from "../services/wallet.api";
import { useMarketplaceLocation, usePrefetchMarketplace } from "../hooks/useMarketplaceData";
import { useAuthStore } from "../stores/useAuthStore";
import { normalizeSearchText, matchesSearchText } from "../utils/search";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, spacing, typography } from "../utils/theme";
import { CourierHomeConversations } from "./home/CourierHomeConversations";
import { RecentConversations } from "./home/RecentConversations";
import { useHomeConversations } from "./home/useHomeConversations";

export function HomeScreen({ navigation }) {
  const { session } = useAuthStore();
  const isFocused = useIsFocused();
  const wallet = useCachedQuery({
    key: session?.user?.id ? readQueryKey("home-wallet", session.user.id) : null,
    enabled: isFocused && Boolean(session?.accessToken),
    load: () => getWalletOverview(session.accessToken),
    delayMs: 200,
  });
  useLiveRefresh({
    accessToken: session?.accessToken,
    scopeKey: String(session?.user?.id ?? ""),
    events: [realtimeEvents.walletUpdated],
    onRefresh: wallet.refresh,
    intervalMs: 0,
  });
  const totalBalance = wallet.data?.summary?.totalCents;
  const balanceLabel = totalBalance != null ? formatarDinheiro(totalBalance)
    : wallet.error ? "Ver carteira" : "Carregando…";
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const { location } = useMarketplaceLocation();
  usePrefetchMarketplace(location, { ready: !searchFocused });
  const { isLoading: suggestionsLoading, suggestions, searchInfo, error: suggestionsError, retry: retrySuggestions } = useMarketplaceSuggestions(session?.accessToken, query, {
    limit: 12,
    minimumCharacters: 2,
    scope: location ? `${location.city}|${location.state}` : "",
    enabled: searchFocused && Boolean(location),
    showInitial: true,
  });
  const recent = useHomeConversations(session?.accessToken);
  const normalizedQuery = normalizeSearchText(query);
  const chatSuggestions = useMemo(() => {
    const matches = (recent.searchableConversations ?? []).filter((conversation) => {
      if (!normalizedQuery) return true;
      return matchesSearchText([
        conversation.title,
        conversation.subtitle,
        conversation.conversation?.serviceType?.name,
        ...(conversation.conversation?.historyServiceNames ?? []),
        conversation.conversation?.store?.name,
      ].filter(Boolean).join(" "), normalizedQuery);
    });

    return matches.slice(0, 4).map((conversation) => ({
      conversation,
      description: conversation.subtitle || "Conversa recente",
      iconUrl: conversation.imageUrl,
      id: conversation.id,
      label: conversation.title,
      type: "conversation",
    }));
  }, [normalizedQuery, recent.searchableConversations]);
  const recentConversationSuggestions = useMemo(
    () => (recent.searchableConversations ?? []).slice(0, 8).map((conversation) => ({
      conversation,
      description: conversation.subtitle || "Conversa recente",
      iconUrl: conversation.imageUrl,
      id: conversation.id,
      label: conversation.title,
      type: "conversation",
    })),
    [recent.searchableConversations],
  );
  const combinedSuggestions = useMemo(() => {
    const marketplaceSuggestions = suggestions.slice(0, 12);
    return normalizedQuery
      ? [...chatSuggestions, ...marketplaceSuggestions].slice(0, 16)
      : marketplaceSuggestions;
  }, [chatSuggestions, normalizedQuery, suggestions]);

  function openSearch(searchValue = query) {
    const value = searchValue.trim();
    const directSuggestion = findDirectStoreSuggestion(value, suggestions);

    if (directSuggestion) {
      openStoreSuggestion(directSuggestion);
      return;
    }

    navigation.navigate("Buscar", { query: value });
  }

  function selectSuggestion(suggestion) {
    if (suggestion.type === "conversation") {
      openConversation(suggestion.conversation);
      return true;
    }

    if (suggestion.type === "category") {
      navigation.navigate("Buscar", { category: suggestion.id, query: "" });
      return true;
    }

    if (suggestion.type === "store") {
      openStoreSuggestion(suggestion);
      return true;
    }

    if (suggestion.type === "product") {
      navigation.navigate("Buscar", {
        query: suggestion.label ?? "",
        resultMode: "products",
      });
      return true;
    }

    if (suggestion.type === "service") {
      navigation.navigate("Buscar", {
        query: suggestion.label ?? "",
        resultMode: "services",
      });
      return true;
    }

    openSearch(suggestion.label);
    return true;
  }

  function openStoreSuggestion(suggestion) {
    navigation.navigate("StoreConversation", {
      storeId: suggestion.storeId ?? suggestion.id,
    });
  }

  function openConversation(conversation) {
    if (conversation.conversation?.historyGroup) {
      navigation.navigate("ServiceHistory", { conversation: conversation.conversation });
      return;
    }
    if (conversation.kind === "person") {
      navigation.navigate("PersonalConversation", {
        conversation: conversation.conversation,
      });
      return;
    }

    if (conversation.kind === "store-order" && conversation.order) {
      navigation.navigate("StoreConversation", {
        conversation: conversation.conversation,
        openOrderId: conversation.order.id,
        storeId: conversation.order.storeId ?? conversation.order.store?.id,
      });
      return;
    }

    if (conversation.kind === "store") {
      navigation.navigate("StoreConversation", {
        conversation: conversation.conversation,
      });
      return;
    }

    navigation.navigate("ServiceConversation", {
      conversation: conversation.conversation,
    });
  }

  return (
    <View style={styles.shell}>
      <ScreenContainer
        contentContainerStyle={styles.root}
        edges={["top", "left", "right", "bottom"]}
        padded={false}
        style={styles.screen}
      >
        <View style={styles.content}>
          <SearchBar
            fullscreen
            initialSuggestionsTitle="Sugestoes para voce"
            loading={suggestionsLoading}
            onChangeText={setQuery}
            onFocusChange={setSearchFocused}
            onSelectSuggestion={selectSuggestion}
            onSubmit={openSearch}
            placeholder="O que voce quer hoje?"
            recentSuggestions={recentConversationSuggestions}
            showVoice
            suggestions={combinedSuggestions}
            searchInfo={searchInfo}
            searchError={suggestionsError}
            onRetrySuggestions={retrySuggestions}
            value={query}
          />

          <View style={styles.quickActions}>
            <HomeAction
              iconBackground={colors.card}
              iconColor={colors.primaryDark}
              icon="trending-up-outline"
              label="Pagar"
              onPress={() => navigation.navigate("ChargeScan")}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Saldo total: ${balanceLabel}`}
              accessibilityHint="Abre sua carteira com os valores disponíveis, pendentes e bloqueados"
              onPress={() => navigation.navigate("Carteira")}
              style={({ pressed }) => [styles.balanceAction, pressed && styles.balanceActionPressed]}
            >
              <Text style={styles.balanceLabel}>SALDO</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={styles.balanceValue}>
                {balanceLabel}
              </Text>
              <View style={styles.balanceLink}>
                <Text style={styles.balanceLinkText}>Ver carteira</Text>
                <Ionicons color={colors.card} name="chevron-forward" size={12} />
              </View>
            </Pressable>
            <HomeAction
              iconBackground={colors.card}
              iconColor={colors.primaryDark}
              icon="trending-down-outline"
              label="Receber"
              onPress={() => navigation.navigate("Vender")}
            />
          </View>

          {recent.courierOnline ? (
            <CourierHomeConversations
              conversations={recent.courierConversations}
              onOpen={(conversation) => navigation.navigate(conversation.historyGroup ? "ServiceHistory" : "ServiceConversation", { conversation })}
              onViewAll={() => navigation.navigate("ServiceDesk")}
            />
          ) : null}

          <RecentConversations
            actionLabel="Meus amigos"
            conversations={recent.conversations}
            isLoading={recent.isLoading}
            onOpen={openConversation}
            onViewAll={() => navigation.navigate("PersonalChatsInbox")}
          />

          <Pressable
            accessibilityHint="Abre seus contatos e permite iniciar uma conversa pelo ID ou QR"
            accessibilityLabel="Meus amigos e contatos"
            onPress={() => navigation.navigate("PersonalChatsInbox")}
            style={({ pressed }) => [styles.friendsShortcut, pressed && styles.friendsShortcutPressed]}
          >
            <View style={styles.friendsShortcutIcon}>
              <Ionicons color={colors.primaryDark} name="people-outline" size={21} />
            </View>
            <View style={styles.friendsShortcutCopy}>
              <Text style={styles.friendsShortcutTitle}>Meus amigos e contatos</Text>
              <Text style={styles.friendsShortcutText}>Encontre pessoas pelo ID ou codigo QR.</Text>
            </View>
            {recent.personalUnreadCount > 0 ? (
              <View style={styles.friendsUnreadBadge}>
                <Text style={styles.friendsUnreadText}>
                  {recent.personalUnreadCount > 99 ? "99+" : recent.personalUnreadCount}
                </Text>
              </View>
            ) : null}
            <Ionicons color={colors.primaryDark} name="chevron-forward" size={19} />
          </Pressable>
        </View>
      </ScreenContainer>
      <Pressable
        accessibilityHint="Abre seus contatos ou permite iniciar uma conversa pelo ID e QR"
        accessibilityLabel="Abrir mensagens e contatos"
        onPress={() => navigation.navigate("PersonalChatsInbox")}
        style={({ pressed }) => [styles.chatFab, pressed && styles.chatFabPressed]}
      >
        <Ionicons color={colors.card} name="chatbubbles" size={24} />
        {recent.personalUnreadCount > 0 ? (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>
              {recent.personalUnreadCount > 99 ? "99+" : recent.personalUnreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function HomeAction({ icon, iconBackground, iconColor, label, onPress }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && styles.quickActionPressed,
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: iconBackground }]}>
        <Ionicons
          color={iconColor}
          name={icon}
          size={21}
        />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function findDirectStoreSuggestion(value, suggestions = []) {
  const normalized = normalizeSearch(value);

  if (!normalized) {
    return null;
  }

  const directSuggestions = suggestions.filter(isStoreSuggestion);
  const exact = directSuggestions.find(
    (suggestion) => normalizeSearch(suggestion.label ?? suggestion.name) === normalized,
  );

  return exact ?? (directSuggestions.length === 1 ? directSuggestions[0] : null);
}

function isStoreSuggestion(suggestion) {
  return String(suggestion?.type ?? "").toLowerCase() === "store";
}

function normalizeSearch(value = "") {
  return normalizeSearchText(value);
}

const styles = StyleSheet.create({
  chatBadge: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderColor: colors.card,
    borderRadius: 999,
    borderWidth: 2,
    height: 23,
    justifyContent: "center",
    minWidth: 23,
    paddingHorizontal: 4,
    position: "absolute",
    right: -5,
    top: -5,
  },
  chatBadgeText: {
    color: "#4A2B00",
    fontFamily: fonts.bold,
    fontSize: 9,
  },
  chatFab: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderColor: colors.card,
    borderRadius: 999,
    borderWidth: 3,
    bottom: 92,
    height: 58,
    justifyContent: "center",
    position: "absolute",
    right: spacing.xl,
    width: 58,
    zIndex: 30,
  },
  chatFabPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  friendsShortcut: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 74,
    padding: spacing.md,
  },
  friendsShortcutCopy: { flex: 1, gap: 2, minWidth: 0 },
  friendsShortcutIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  friendsShortcutPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  friendsShortcutText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  friendsShortcutTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
  },
  friendsUnreadBadge: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderRadius: 999,
    height: 23,
    justifyContent: "center",
    minWidth: 23,
    paddingHorizontal: 5,
  },
  friendsUnreadText: { color: "#4A2B00", fontFamily: fonts.bold, fontSize: 10 },
  content: {
    alignItems: "center",
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  quickAction: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#B7DECC",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "column",
    gap: 3,
    minHeight: 72,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
  },
  balanceAction: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    borderWidth: 1,
    flex: 1.5,
    gap: 3,
    justifyContent: "center",
    minHeight: 72,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
    borderRadius: 16,
  },
  balanceActionPressed: {
    backgroundColor: "#056448",
    borderColor: "#056448",
  },
  balanceLabel: {
    color: colors.primaryLight,
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1.1,
    textAlign: "center",
  },
  balanceLink: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 2,
  },
  balanceLinkText: {
    color: colors.card,
    fontFamily: fonts.medium,
    fontSize: 11,
    textAlign: "center",
  },
  balanceValue: {
    color: colors.card,
    fontFamily: fonts.bold,
    fontSize: 20,
    textAlign: "center",
    width: "100%",
  },
  quickActionIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  quickActionLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  quickActionPressed: {
    backgroundColor: colors.primaryLight,
    opacity: 0.85,
  },
  quickActions: {
    alignItems: "stretch",
    borderRadius: 8,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: 440,
    width: "100%",
  },
  root: {
    flexGrow: 1,
  },
  screen: {
    backgroundColor: colors.card,
  },
  shell: {
    flex: 1,
  },
});
