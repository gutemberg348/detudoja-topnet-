import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { getCustomerOrders } from "../services/orders.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getServiceConversations } from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDataHora } from "../utils/date";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

const activeStatuses = new Set([
  "NEGOCIANDO",
  "AGUARDANDO_PAGAMENTO",
  "RECEBIDO",
  "ACEITO",
  "PREPARANDO",
  "SAIU_ENTREGA",
  "PRONTO_RETIRADA",
]);
const historyStatuses = new Set(["CONCLUIDO", "CANCELADO"]);

const periodOptions = [
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "week" },
  { label: "Todos", value: "all" },
];

const statusCopy = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  ACEITO: "Aceito",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluido",
  NEGOCIANDO: "Em negociacao",
  PREPARANDO: "Preparando",
  PRONTO_RETIRADA: "Pronto",
  RECEBIDO: "Recebido",
  SAIU_ENTREGA: "Saiu para entrega",
};

const serviceStatusCopy = {
  ABERTA: "Negociando",
  ACORDADA: "Em atendimento",
  AGUARDANDO_CONFIRMACAO: "Confirme o servico",
  CANCELADA: "Cancelada",
  ENCERRADA: "Concluida",
};

function isActiveOrder(order) {
  return activeStatuses.has(order.status);
}

function isHistoryOrder(order) {
  return historyStatuses.has(order.status);
}

function isOrderInPeriod(order, period) {
  if (period === "all") {
    return true;
  }

  const reference = new Date(order.updatedAt ?? order.createdAt ?? Date.now());
  const now = new Date();

  if (period === "today") {
    return reference.toDateString() === now.toDateString();
  }

  if (period === "week") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return reference >= sevenDaysAgo;
  }

  return true;
}

function countActiveOrdersInPeriod(orders, period) {
  return orders.filter((order) => isActiveOrder(order) && isOrderInPeriod(order, period)).length;
}

function unreadCustomerMessages(order) {
  return Number(order.unreadCustomerMessages ?? order.unreadMessagesCount ?? 0);
}

function countUnreadCustomerMessages(orders) {
  return orders.reduce((total, order) => total + unreadCustomerMessages(order), 0);
}

function unreadServiceMessages(conversation) {
  return Number(conversation.unreadCount ?? 0);
}

function countUnreadServiceMessages(conversations) {
  return conversations.reduce((total, conversation) => total + unreadServiceMessages(conversation), 0);
}

function formatDateTime(value) {
  if (!value) {
    return "Agora";
  }

  return formatarDataHora(value) || "Agora";
}

function orderSubtitle(order) {
  const names = (order.items ?? []).map((item) => item.name).filter(Boolean);

  if (!names.length) {
    return "Pedido da loja";
  }

  if (names.length === 1) {
    return names[0];
  }

  return `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
}

function upsertOrder(orders, nextOrder) {
  if (!nextOrder?.id) {
    return orders;
  }

  const exists = orders.some((order) => order.id === nextOrder.id);
  const nextOrders = exists
    ? orders.map((order) => (order.id === nextOrder.id ? nextOrder : order))
    : [nextOrder, ...orders];

  return nextOrders.sort(
    (first, second) =>
      new Date(second.updatedAt ?? second.createdAt ?? 0) -
      new Date(first.updatedAt ?? first.createdAt ?? 0),
  );
}

export function CustomerOrdersScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [orders, setOrders] = useState([]);
  const [serviceConversations, setServiceConversations] = useState([]);
  const [period, setPeriod] = useState("today");
  const [view, setView] = useState("active");
  const highlightOrderId = route.params?.highlightOrderId;
  const initialView = route.params?.initialView;

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) {
      return;
    }

    if (!silent) {
      setError("");
      setIsLoading(true);
    }

    try {
      const response = await getCustomerOrders(session.accessToken);
      setOrders(response.orders ?? []);
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message ?? "Nao foi possivel carregar seus pedidos.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [session?.accessToken]);

  const loadServiceConversations = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) {
      setServiceConversations([]);
      setIsLoadingServices(false);
      return;
    }

    if (!silent) setIsLoadingServices(true);

    try {
      const response = await getServiceConversations(session.accessToken);
      setServiceConversations(
        (response.conversations ?? []).filter((conversation) => !conversation.isSeller),
      );
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message ?? "Nao foi possivel carregar seus atendimentos.");
      }
    } finally {
      if (!silent) setIsLoadingServices(false);
    }
  }, [session?.accessToken]);

  useFocusEffect(useCallback(() => {
    if (["active", "history", "services"].includes(initialView)) {
      setView(initialView);
      navigation.setParams({ initialView: undefined });
    }

    loadOrders();
    loadServiceConversations();
  }, [initialView, loadOrders, loadServiceConversations, navigation]));

  const handleRealtimeOrder = useCallback((payload) => {
    if (payload.order) {
      setOrders((current) => upsertOrder(current, payload.order));

      if (isHistoryOrder(payload.order)) {
        setView("history");
      }
    }

    loadOrders({ silent: true });
  }, [loadOrders]);

  const handleRealtimeMessage = useCallback(() => {
    loadOrders({ silent: true });
  }, [loadOrders]);

  useRealtimeOrders({
    accessToken: session?.accessToken,
    onMessageEvent: handleRealtimeMessage,
    onOrderEvent: handleRealtimeOrder,
  });

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshServices = () => loadServiceConversations({ silent: true });

    socket?.on(realtimeEvents.serviceChatCreated, refreshServices);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refreshServices);
    socket?.on(realtimeEvents.serviceChatUpdated, refreshServices);

    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refreshServices);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refreshServices);
      socket?.off(realtimeEvents.serviceChatUpdated, refreshServices);
    };
  }, [loadServiceConversations, session?.accessToken]);

  const activeCount = orders.filter(isActiveOrder).length;
  const unreadMessagesCount = countUnreadCustomerMessages(orders);
  const unreadServiceMessagesCount = countUnreadServiceMessages(serviceConversations);
  const unreadCommunicationCount = unreadMessagesCount + unreadServiceMessagesCount;
  const filteredOrders = orders.filter((order) => isOrderInPeriod(order, period));
  const activeOrders = filteredOrders.filter(isActiveOrder);
  const historyOrders = filteredOrders.filter(isHistoryOrder);
  const visibleOrders = view === "history" ? historyOrders : activeOrders;
  const hasActiveOutsideCurrentPeriod = view === "active" && activeCount > activeOrders.length;

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pedidos e conversas</Text>
          <Text style={styles.subtitle}>
            Acompanhe lojas, prestadores e todas as suas mensagens.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Atualizar pedidos e conversas"
          onPress={() => {
            loadOrders();
            loadServiceConversations();
          }}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.primaryDark} name="refresh-outline" size={21} />
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons color={colors.info} name="chatbubbles-outline" size={23} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>
            {unreadCommunicationCount > 0
              ? `${unreadCommunicationCount} ${unreadCommunicationCount > 1 ? "mensagens novas" : "mensagem nova"}`
              : activeCount > 0
                ? `${activeCount} pedido${activeCount > 1 ? "s" : ""} em andamento`
                : "Nenhum pedido em andamento"}
          </Text>
          <Text style={styles.summaryText}>
            {unreadCommunicationCount > 0
              ? "Voce recebeu uma resposta. Abra a conversa para ler e responder."
              : "Pedidos e atendimentos ficam salvos aqui, mesmo depois que voce sair."}
          </Text>
        </View>
      </View>

      {view !== "services" && orders.length ? (
        <View style={styles.periodFilters}>
            {periodOptions.map((option) => {
              const periodActiveCount = countActiveOrdersInPeriod(orders, option.value);
              const selected = period === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPeriod(option.value)}
                  style={({ pressed }) => [
                    styles.periodButton,
                    selected && styles.periodButtonActive,
                    periodActiveCount > 0 && !selected && styles.periodButtonWithBadge,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[
                    styles.periodButtonText,
                    selected && styles.periodButtonTextActive,
                  ]}>
                    {option.label}
                  </Text>
                  {periodActiveCount > 0 ? (
                    <View style={[
                      styles.periodBadge,
                      selected && styles.periodBadgeActive,
                    ]}>
                      <Text style={[
                        styles.periodBadgeText,
                        selected && styles.periodBadgeTextActive,
                      ]}>
                        {periodActiveCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
        </View>
      ) : null}

      {orders.length || serviceConversations.length ? (
        <View style={styles.orderTabs}>
          <OrderTab
            active={view === "active"}
            count={activeOrders.length}
            icon="flash-outline"
            label="Ativos"
            onPress={() => setView("active")}
          />
          <OrderTab
            active={view === "history"}
            count={historyOrders.length}
            icon="archive-outline"
            label="Historico"
            onPress={() => setView("history")}
          />
          <OrderTab
            active={view === "services"}
            count={serviceConversations.length}
            icon="chatbubbles-outline"
            label="Chats"
            notificationCount={unreadServiceMessagesCount}
            onPress={() => setView("services")}
          />
        </View>
      ) : null}

      {view === "services" && isLoadingServices ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primaryDark} size="large" />
          <Text style={styles.stateText}>Buscando suas conversas...</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primaryDark} size="large" />
          <Text style={styles.stateText}>Buscando seus pedidos...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
          <Text style={styles.errorText}>{error}</Text>
          <AppButton onPress={loadOrders} title="Tentar novamente" />
        </View>
      ) : view === "services" && serviceConversations.length ? (
        <View style={styles.ordersList}>
          {serviceConversations.map((conversation) => (
            <ServiceConversationCard
              conversation={conversation}
              key={conversation.id}
              onPress={() => navigation.navigate("ServiceConversation", { conversation })}
            />
          ))}
        </View>
      ) : view === "services" ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={30} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum atendimento ainda</Text>
          <Text style={styles.emptyText}>
            Quando voce chamar um prestador, o chat e todas as atualizacoes ficam salvos aqui.
          </Text>
          <AppButton
            icon="search-outline"
            onPress={() => navigation.navigate("Main", { screen: "Buscar" })}
            title="Encontrar servicos"
          />
        </View>
      ) : orders.length && visibleOrders.length ? (
        <View style={styles.ordersList}>
          {visibleOrders.map((order) => (
            <OrderCard
              highlighted={highlightOrderId === order.id}
              key={order.id}
              onPress={() => navigation.navigate("StoreConversation", {
                openOrderId: order.id,
                store: order.store,
                storeId: order.storeId ?? order.store?.id,
              })}
              order={order}
            />
          ))}
        </View>
      ) : orders.length ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons color={colors.primaryDark} name={view === "history" ? "archive-outline" : "receipt-outline"} size={30} />
          </View>
          <Text style={styles.emptyTitle}>
            {view === "history" ? "Nada no historico desse periodo" : "Nenhum pedido ativo nesse periodo"}
          </Text>
          <Text style={styles.emptyText}>
            {hasActiveOutsideCurrentPeriod
              ? "Tem pedido ativo em outro periodo. Veja a bolinha em 7 dias ou Todos para achar rapido."
              : "Use os filtros acima para ver hoje, ultimos 7 dias ou todos os pedidos."}
          </Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons color={colors.primaryDark} name="receipt-outline" size={30} />
          </View>
          <Text style={styles.emptyTitle}>Voce ainda nao comprou por aqui</Text>
          <Text style={styles.emptyText}>
            Quando finalizar uma compra online, o pedido aparece nesta pagina.
          </Text>
          <AppButton
            icon="storefront-outline"
            onPress={() => navigation.navigate("Main", { screen: "Buscar" })}
            title="Ver lojas"
          />
        </View>
      )}
    </ScreenContainer>
  );
}

function OrderTab({ active, count, icon, label, notificationCount = 0, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.orderTab,
        active && styles.orderTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={active ? colors.primaryDark : colors.textSecondary} name={icon} size={17} />
      <Text style={[styles.orderTabText, active && styles.orderTabTextActive]}>
        {label}
      </Text>
      <View style={[
        styles.orderTabCount,
        active && styles.orderTabCountActive,
        notificationCount > 0 && styles.orderTabCountNotify,
      ]}>
        <Text style={[styles.orderTabCountText, active && styles.orderTabCountTextActive]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function ServiceConversationCard({ conversation, onPress }) {
  const unreadCount = unreadServiceMessages(conversation);
  const proposal = [...(conversation.proposals ?? [])].reverse()[0];
  const subtitle = conversation.lastMessage?.text
    || (proposal ? "Existe uma proposta aguardando voce." : "Conversa iniciada");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceCard,
        unreadCount > 0 && styles.serviceCardUnread,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.serviceIcon}>
        <Ionicons color={colors.primaryDark} name="briefcase-outline" size={21} />
      </View>
      <View style={styles.serviceCopy}>
        <View style={styles.serviceTitleRow}>
          <Text numberOfLines={1} style={styles.serviceTitle}>
            {conversation.serviceType?.name ?? conversation.segment?.name ?? "Servico"}
          </Text>
          <Text style={styles.serviceStatus}>
            {serviceStatusCopy[conversation.status] ?? conversation.status}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.serviceProvider}>
          {conversation.otherPerson?.name ?? "Prestador"}
        </Text>
        <Text numberOfLines={2} style={styles.serviceMessage}>{subtitle}</Text>
        {unreadCount > 0 ? (
          <View style={styles.serviceUnreadRow}>
            <Ionicons color={colors.danger} name="chatbubble-ellipses" size={14} />
            <Text style={styles.serviceUnreadText}>
              {unreadCount} {unreadCount > 1 ? "mensagens novas" : "mensagem nova"}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.serviceEnd}>
        {unreadCount > 0 ? (
          <View style={styles.serviceUnreadBadge}>
            <Text style={styles.serviceUnreadBadgeText}>{unreadCount}</Text>
          </View>
        ) : null}
        <Ionicons color={colors.primaryDark} name="chevron-forward" size={20} />
      </View>
    </Pressable>
  );
}

function OrderCard({ highlighted, onPress, order }) {
  const active = isActiveOrder(order);
  const unreadCount = unreadCustomerMessages(order);
  const hasUnreadMessages = unreadCount > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.orderCard,
        hasUnreadMessages && styles.orderCardUnread,
        highlighted && styles.orderCardHighlighted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.orderTop}>
        <View style={styles.storeIcon}>
          <Ionicons color={colors.primaryDark} name="storefront-outline" size={21} />
        </View>
        <View style={styles.orderCopy}>
          <Text numberOfLines={1} style={styles.storeName}>{order.store?.name ?? "Loja"}</Text>
          <Text numberOfLines={1} style={styles.orderItems}>{orderSubtitle(order)}</Text>
        </View>
        <View style={[styles.statusPill, active ? styles.statusPillActive : styles.statusPillDone]}>
          <Text style={[styles.statusPillText, active ? styles.statusPillTextActive : styles.statusPillTextDone]}>
            {statusCopy[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      <View style={styles.orderMeta}>
        <InfoChip icon="receipt-outline" label={order.code ?? "Pedido"} />
        <InfoChip icon="time-outline" label={formatDateTime(order.updatedAt ?? order.createdAt)} />
      </View>

      {hasUnreadMessages ? (
        <View style={styles.unreadMessageBanner}>
          <View style={styles.unreadMessageIcon}>
            <Ionicons color={colors.card} name="chatbubble-ellipses" size={15} />
          </View>
          <View style={styles.unreadMessageCopy}>
            <Text style={styles.unreadMessageTitle}>
              {unreadCount} {unreadCount > 1 ? "mensagens novas" : "mensagem nova"} da loja
            </Text>
            <Text style={styles.unreadMessageText}>
              Toque em acompanhar para ver e responder.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.orderFooter}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatarDinheiro(order.totalCents)}</Text>
        </View>
        <View style={styles.followAction}>
          <Text style={styles.followText}>{active ? "Acompanhar" : "Ver detalhes"}</Text>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={18} />
        </View>
      </View>
    </Pressable>
  );
}

function InfoChip({ icon, label }) {
  return (
    <View style={styles.infoChip}>
      <Ionicons color={colors.textMuted} name={icon} size={14} />
      <Text numberOfLines={1} style={styles.infoChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
    ...shadow,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
    textAlign: "center",
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: "center",
  },
  followAction: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  followText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  infoChip: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "48%",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  infoChipText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  orderCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    ...shadow,
  },
  orderCardHighlighted: {
    borderColor: colors.info,
    borderWidth: 2,
  },
  orderCardUnread: {
    borderColor: colors.info,
    borderWidth: 2,
  },
  orderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  orderFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderItems: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
  },
  orderMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  ordersList: {
    gap: spacing.md,
  },
  orderTab: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  orderTabActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
  },
  orderTabCount: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: radius.round,
    height: 22,
    justifyContent: "center",
    minWidth: 22,
    paddingHorizontal: 6,
    position: "absolute",
    right: 7,
    top: 7,
  },
  orderTabCountActive: {
    backgroundColor: colors.primaryDark,
  },
  orderTabCountNotify: {
    backgroundColor: colors.danger,
  },
  orderTabCountText: {
    color: colors.textSecondary,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
    fontWeight: "800",
  },
  orderTabCountTextActive: {
    color: colors.card,
  },
  orderTabs: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  orderTabText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  orderTabTextActive: {
    color: colors.primaryDark,
  },
  orderTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  periodButton: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  periodButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  periodButtonText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 32,
  },
  periodButtonTextActive: {
    color: colors.card,
  },
  periodButtonWithBadge: {
    borderColor: colors.primaryLight,
  },
  periodBadge: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 5,
  },
  periodBadgeActive: {
    backgroundColor: colors.card,
  },
  periodBadgeText: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
  },
  periodBadgeTextActive: {
    color: colors.primaryDark,
  },
  periodFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  serviceCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 116,
    padding: spacing.lg,
    ...shadow,
  },
  serviceCardUnread: {
    borderColor: colors.info,
    borderWidth: 2,
  },
  serviceCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  serviceEnd: {
    alignItems: "center",
    gap: spacing.sm,
  },
  serviceIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  serviceMessage: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
    marginTop: 2,
  },
  serviceProvider: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  serviceStatus: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    maxWidth: "48%",
    textAlign: "right",
  },
  serviceTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  serviceTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  serviceUnreadBadge: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.round,
    height: 24,
    justifyContent: "center",
    minWidth: 24,
    paddingHorizontal: 6,
  },
  serviceUnreadBadgeText: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
  },
  serviceUnreadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: spacing.xs,
  },
  serviceUnreadText: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
    ...shadow,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  statusPill: {
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusPillActive: {
    backgroundColor: "#EFF6FF",
  },
  statusPillDone: {
    backgroundColor: "#F3F4F6",
  },
  statusPillText: {
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  statusPillTextActive: {
    color: colors.info,
  },
  statusPillTextDone: {
    color: colors.textSecondary,
  },
  storeIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  storeName: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 22,
    maxWidth: 280,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  summaryText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h1,
    fontWeight: "800",
  },
  totalLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  totalValue: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  unreadMessageBanner: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  unreadMessageCopy: {
    flex: 1,
    gap: 2,
  },
  unreadMessageIcon: {
    alignItems: "center",
    backgroundColor: colors.info,
    borderRadius: radius.round,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  unreadMessageText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  unreadMessageTitle: {
    color: colors.info,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
});
