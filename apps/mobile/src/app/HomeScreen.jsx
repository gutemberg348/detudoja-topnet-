import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { SearchBar } from "../components/SearchBar";
import { useMarketplaceSuggestions } from "../hooks/useMarketplaceSuggestions";
import { useAuthStore } from "../stores/useAuthStore";
import { normalizeSearchText } from "../utils/search";
import { colors, fonts, spacing, typography } from "../utils/theme";
import { RecentConversations } from "./home/RecentConversations";
import { useHomeConversations } from "./home/useHomeConversations";

export function HomeScreen({ navigation }) {
  const { session } = useAuthStore();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const { isLoading: suggestionsLoading, suggestions } = useMarketplaceSuggestions(session?.accessToken, query, {
    enabled: searchFocused,
    limit: 12,
    minimumCharacters: 2,
    showInitial: true,
  });
  const recent = useHomeConversations(session?.accessToken);

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
    if (conversation.kind === "person") {
      navigation.navigate("PersonalConversation", {
        conversation: conversation.conversation,
      });
      return;
    }

    if (conversation.kind === "order") {
      navigation.navigate("CustomerOrderDetails", { order: conversation.order });
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
            loading={suggestionsLoading}
            onChangeText={setQuery}
            onFocusChange={setSearchFocused}
            onSelectSuggestion={selectSuggestion}
            onSubmit={openSearch}
            placeholder="O que voce quer hoje?"
            showVoice
            suggestions={suggestions}
            value={query}
          />

          <View style={styles.quickActions}>
            <HomeAction
              iconBackground={colors.primarySoft}
              iconColor={colors.primaryDark}
              icon="trending-up-outline"
              label="Pagar"
              onPress={() => navigation.navigate("ChargeScan")}
            />
            <View style={styles.quickActionDivider} />
            <HomeAction
              iconBackground={colors.primarySoft}
              iconColor={colors.primaryDark}
              icon="trending-down-outline"
              label="Receber"
              onPress={() => navigation.navigate("Vender")}
            />
          </View>

          <RecentConversations
            actionLabel="Conversar"
            conversations={recent.conversations}
            isLoading={recent.isLoading}
            onOpen={openConversation}
            onViewAll={() => navigation.navigate("PersonalChatsInbox")}
          />
        </View>
      </ScreenContainer>
      <Pressable
        accessibilityLabel="Abrir conversas com amigos"
        onPress={() => navigation.navigate("PersonalChatsInbox")}
        style={({ pressed }) => [styles.chatFab, pressed && styles.chatFabPressed]}
      >
        <Ionicons color={colors.card} name="chatbubbles" size={24} />
        {recent.personalUnreadCount > 0 ? (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>
              {recent.personalUnreadCount > 9 ? "9+" : recent.personalUnreadCount}
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
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: -5,
    top: -5,
    minWidth: 22,
    paddingHorizontal: 4,
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
    bottom: spacing.xl,
    height: 58,
    justifyContent: "center",
    position: "absolute",
    right: spacing.xl,
    width: 58,
  },
  chatFabPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  content: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  quickAction: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    height: 54,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  quickActionDivider: {
    backgroundColor: colors.primaryLight,
    height: 30,
    width: StyleSheet.hairlineWidth,
  },
  quickActionIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  quickActionLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    lineHeight: 20,
  },
  quickActionPressed: {
    backgroundColor: colors.primarySoft,
    opacity: 0.72,
  },
  quickActions: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    maxWidth: 440,
    width: "100%",
  },
  root: {
    flex: 1,
  },
  screen: {
    backgroundColor: colors.card,
  },
  shell: {
    flex: 1,
  },
});
