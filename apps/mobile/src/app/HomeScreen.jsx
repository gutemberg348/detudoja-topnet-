import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BrandLogo } from "../components/BrandLogo";
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
  const { suggestions } = useMarketplaceSuggestions(session?.accessToken, query, {
    limit: 8,
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

    if (isStoreSuggestion(suggestion)) {
      openStoreSuggestion(suggestion);
      return true;
    }

    openSearch(suggestion.label);
    return true;
  }

  function openStoreSuggestion(suggestion) {
    navigation.navigate("StoreDetails", {
      lojaId: suggestion.storeId ?? suggestion.id,
    });
  }

  function openConversation(conversation) {
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
    <ScreenContainer
      contentContainerStyle={styles.root}
      edges={["top", "left", "right", "bottom"]}
      padded={false}
      style={styles.screen}
    >
      <View style={styles.content}>
        <View style={styles.discovery}>
          <BrandLogo centered size="large" />

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

          <SearchBar
            onChangeText={setQuery}
            onSelectSuggestion={selectSuggestion}
            onSubmit={openSearch}
            placeholder="O que voce quer hoje?"
            showVoice
            suggestions={suggestions}
            value={query}
          />

          <View style={styles.promise}>
            <Ionicons color={colors.primary} name="sparkles" size={18} />
            <Text style={styles.promiseText}>
              Compre, pague, converse, venda ou encontre servicos
            </Text>
          </View>
        </View>

        <RecentConversations
          actionLabel="Conversar"
          conversations={recent.conversations}
          isLoading={recent.isLoading}
          onOpen={openConversation}
          onViewAll={() => navigation.navigate("StoreChatsInbox")}
        />
      </View>
    </ScreenContainer>
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
  return ["store", "product"].includes(String(suggestion?.type ?? "").toLowerCase());
}

function normalizeSearch(value = "") {
  return normalizeSearchText(value);
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  discovery: {
    alignItems: "center",
    gap: spacing.lg,
    width: "100%",
  },
  promise: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    maxWidth: 390,
    paddingHorizontal: spacing.sm,
  },
  promiseText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
    textAlign: "center",
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
});
