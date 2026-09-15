import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getMyStoreWorkplaces, getSellerProfile } from "../services/seller.api";
import {
  getStoreConversations,
  subscribeStoreConversationRead,
} from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function StoreChatsInboxScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const scope = route.params?.scope === "seller" ? "seller" : "customer";
  const initialStore = route.params?.store ?? null;
  const initialStoreId = Number(route.params?.storeId ?? initialStore?.id) || null;
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId);
  const [stores, setStores] = useState(initialStore ? [initialStore] : []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) {
      return;
    }

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const [conversationsResponse, sellerResponse, workplacesResponse] = await Promise.all([
        getStoreConversations(session.accessToken, { scope }),
        scope === "seller"
          ? getSellerProfile(session.accessToken)
          : Promise.resolve(null),
        scope === "seller"
          ? getMyStoreWorkplaces(session.accessToken)
          : Promise.resolve(null),
      ]);

      setConversations(conversationsResponse.conversations ?? []);

      if (sellerResponse) {
        const availableStores = [
          ...(sellerResponse.stores ?? []),
          ...(workplacesResponse?.workplaces ?? []).map((item) => item.store),
        ].filter((item, index, all) => item?.id && all.findIndex((candidate) => candidate?.id === item.id) === index);
        setStores(availableStores);
      }
    } catch (requestError) {
      if (!silent) {
        setError(
          requestError.message
          ?? "Nao foi possivel carregar as conversas das lojas.",
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [scope, session?.accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session?.accessToken) {
      return undefined;
    }

    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => load({ silent: true });

    socket?.on(realtimeEvents.storeChatCreated, refresh);
    socket?.on(realtimeEvents.storeChatMessageCreated, refresh);
    socket?.on(realtimeEvents.storeChatUpdated, refresh);

    return () => {
      socket?.off(realtimeEvents.storeChatCreated, refresh);
      socket?.off(realtimeEvents.storeChatMessageCreated, refresh);
      socket?.off(realtimeEvents.storeChatUpdated, refresh);
    };
  }, [load, session?.accessToken]);

  useEffect(
    () => subscribeStoreConversationRead(({ conversationId }) => {
      setConversations((current) =>
        current.map((conversation) =>
          Number(conversation.id) === Number(conversationId)
            ? { ...conversation, unreadCount: 0 }
            : conversation,
        ),
      );
    }),
    [],
  );

  const selectedStore = useMemo(
    () =>
      stores.find((store) => Number(store.id) === Number(selectedStoreId))
      ?? (Number(initialStore?.id) === Number(selectedStoreId)
        ? initialStore
        : null),
    [initialStore, selectedStoreId, stores],
  );
  const visibleConversations = useMemo(
    () =>
      scope === "seller" && selectedStoreId
        ? conversations.filter(
            (conversation) =>
              Number(conversation.store?.id) === Number(selectedStoreId),
          )
        : conversations,
    [conversations, scope, selectedStoreId],
  );
  const storeConversationStats = useMemo(
    () =>
      conversations.reduce((stats, conversation) => {
        const conversationStoreId = Number(conversation.store?.id);

        if (!conversationStoreId) {
          return stats;
        }

        const current = stats.get(conversationStoreId) ?? {
          conversations: 0,
          unread: 0,
        };
        current.conversations += 1;
        current.unread += Number(conversation.unreadCount ?? 0);
        stats.set(conversationStoreId, current);
        return stats;
      }, new Map()),
    [conversations],
  );

  function openConversation(conversation) {
    navigation.navigate("StoreConversation", {
      conversation,
      scope,
    });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <PageHeader
        action={
          scope === "seller" && selectedStoreId ? (
            <Pressable
              onPress={() => setSelectedStoreId(null)}
              style={({ pressed }) => [
                styles.switchStore,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={colors.primaryDark} name="swap-horizontal-outline" size={16} />
              <Text style={styles.switchStoreText}>Trocar loja</Text>
            </Pressable>
          ) : null
        }
        eyebrow={
          scope === "seller"
            ? selectedStoreId
              ? "Atendimento da loja"
              : "Central de conversas"
            : "Suas conversas"
        }
        subtitle={
          scope === "seller"
            ? selectedStoreId
              ? "Responda somente os clientes desta operacao."
              : "Escolha uma loja antes de abrir os atendimentos."
            : "Retome suas duvidas e conversas gerais com lojas."
        }
        title={
          scope === "seller"
            ? selectedStore?.name ?? "Escolha uma loja"
            : "Lojas no chat"
        }
      />

      {loading ? (
        <StatePanel icon="chatbubbles-outline" loading text="Carregando conversas..." />
      ) : error ? (
        <StatePanel
          actionLabel="Tentar novamente"
          danger
          icon="alert-circle-outline"
          onAction={load}
          text={error}
        />
      ) : scope === "seller" && !selectedStoreId ? (
        stores.length ? (
          <View style={styles.storeList}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Suas lojas</Text>
              <Text style={styles.sectionCount}>{stores.length}</Text>
            </View>
            {stores.map((store) => (
              <StoreSelectorRow
                key={store.id}
                onPress={() => setSelectedStoreId(store.id)}
                stats={storeConversationStats.get(Number(store.id))}
                store={store}
              />
            ))}
          </View>
        ) : (
          <StatePanel
            icon="storefront-outline"
            text="Cadastre uma loja para receber e organizar conversas de clientes."
            title="Nenhuma loja cadastrada"
          />
        )
      ) : visibleConversations.length ? (
        <View style={styles.list}>
          {scope === "seller" && selectedStore ? (
            <SelectedStoreCard
              conversationsCount={visibleConversations.length}
              store={selectedStore}
            />
          ) : null}
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>
              {scope === "seller" ? "Clientes" : "Conversas recentes"}
            </Text>
            <Text style={styles.sectionCount}>{visibleConversations.length}</Text>
          </View>
          {visibleConversations.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              key={conversation.id}
              onPress={() => openConversation(conversation)}
              showStoreName={scope !== "seller"}
            />
          ))}
        </View>
      ) : (
        <StatePanel
          icon="chatbubbles-outline"
          text={
            scope === "seller"
              ? "Esta loja ainda nao recebeu duvidas gerais de clientes."
              : "Abra uma loja e toque em Falar com a loja para iniciar."
          }
          title="Nenhuma conversa ainda"
        />
      )}
    </ScreenContainer>
  );
}

function StoreSelectorRow({ onPress, stats = {}, store }) {
  const logoUrl = resolveMediaUrl(store.logoUrl);
  const unreadCount = Number(stats.unread ?? 0);
  const conversationsCount = Number(stats.conversations ?? 0);
  const active = store.status === "ATIVA";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.storeRow,
        unreadCount > 0 && styles.storeRowUnread,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.storeAvatar}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons color={colors.primaryDark} name="storefront-outline" size={22} />
        )}
      </View>
      <View style={styles.copy}>
        <View style={styles.storeTitleLine}>
          <Text numberOfLines={1} style={styles.storeTitle}>{store.name}</Text>
          <View style={styles.storeStatus}>
            <View
              style={[
                styles.storeStatusDot,
                !active && styles.storeStatusDotInactive,
              ]}
            />
            <Text style={styles.storeStatusText}>
              {active ? "ativa" : "pausada"}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.storeMeta}>
          {conversationsCount
            ? `${conversationsCount} cliente${conversationsCount === 1 ? "" : "s"} no atendimento`
            : "Nenhuma conversa iniciada"}
        </Text>
      </View>
      {unreadCount > 0 ? (
        <View style={styles.storeUnreadPill}>
          <Ionicons color="#92400E" name="chatbubble-ellipses" size={13} />
          <Text style={styles.storeUnreadPillText}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      ) : null}
      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

function SelectedStoreCard({ conversationsCount, store }) {
  const logoUrl = resolveMediaUrl(store.logoUrl);

  return (
    <View style={styles.selectedStore}>
      <View style={styles.selectedStoreIcon}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons color={colors.primaryDark} name="storefront-outline" size={22} />
        )}
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.selectedStoreEyebrow}>
          LOJA SELECIONADA
        </Text>
        <Text numberOfLines={1} style={styles.selectedStoreName}>
          {store.name}
        </Text>
      </View>
      <View style={styles.selectedStoreCount}>
        <Text style={styles.selectedStoreCountValue}>{conversationsCount}</Text>
        <Text style={styles.selectedStoreCountLabel}>
          {conversationsCount === 1 ? "cliente" : "clientes"}
        </Text>
      </View>
    </View>
  );
}

function ConversationRow({ conversation, onPress, showStoreName }) {
  const imageUrl = conversation.isStore
    ? conversation.customer?.photoUrl
    : conversation.store?.logoUrl;
  const title = conversation.otherPerson?.name ?? conversation.store?.name ?? "Conversa";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        conversation.unreadCount > 0 && styles.rowUnread,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatar}>
        {imageUrl ? (
          <Image
            source={{ uri: resolveMediaUrl(imageUrl) }}
            style={styles.avatarImage}
          />
        ) : (
          <Ionicons color={colors.primaryDark} name="storefront-outline" size={21} />
        )}
      </View>
      <View style={styles.copy}>
        {showStoreName ? (
          <Text numberOfLines={1} style={styles.storeName}>
            {conversation.store?.name}
          </Text>
        ) : null}
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Text style={styles.date}>{formatDate(conversation.updatedAt)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.message}>
          {conversation.lastMessage?.text ?? "Conversa da loja"}
        </Text>
        {conversation.unreadCount > 0 ? (
          <Text style={styles.unreadLabel}>Nova mensagem</Text>
        ) : null}
      </View>
      {conversation.unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
          </Text>
        </View>
      ) : (
        <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
      )}
    </Pressable>
  );
}

function formatDate(value) {
  const date = new Date(value ?? Date.now());
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 46,
    justifyContent: "center",
    overflow: "hidden",
    width: 46,
  },
  avatarImage: { height: "100%", width: "100%" },
  badge: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderRadius: radius.round,
    height: 23,
    justifyContent: "center",
    minWidth: 23,
    paddingHorizontal: 5,
  },
  badgeText: {
    color: "#4A2B00",
    fontFamily: fonts.extraBold,
    fontSize: 10,
  },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  date: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  list: { gap: spacing.md },
  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  pressed: { opacity: 0.76 },
  row: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.md,
  },
  rowUnread: {
    backgroundColor: "#FFFCF2",
    borderColor: "#FDE68A",
  },
  sectionCount: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    color: colors.textSecondary,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    minWidth: 25,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    textAlign: "center",
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  selectedStore: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  selectedStoreCount: {
    alignItems: "flex-end",
    gap: 1,
  },
  selectedStoreCountLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 9,
  },
  selectedStoreCountValue: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  selectedStoreEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 9,
  },
  selectedStoreIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
    width: 48,
  },
  selectedStoreName: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  storeAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    overflow: "hidden",
    width: 50,
  },
  storeList: { gap: spacing.md },
  storeMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  storeName: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  storeRow: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.md,
  },
  storeRowUnread: {
    backgroundColor: "#FFFCF2",
    borderColor: "#FDE68A",
  },
  storeStatus: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  storeStatusDot: {
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 6,
    width: 6,
  },
  storeStatusDotInactive: { backgroundColor: colors.textMuted },
  storeStatusText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 9,
  },
  storeTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  storeTitleLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  storeUnreadPill: {
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  storeUnreadPillText: {
    color: "#78350F",
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
  },
  switchStore: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  switchStoreText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  title: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
  },
  titleLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  unreadLabel: {
    color: "#92400E",
    fontFamily: fonts.bold,
    fontSize: 10,
  },
});
