import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../components/AppButton";
import { ChatAttachment } from "../components/ChatAttachment";
import { ChatComposer } from "../components/ChatComposer";
import { ChatMessageMeta } from "../components/ChatMessageMeta";
import { ChatSystemMessage } from "../components/ChatSystemMessage";
import { ScreenContainer } from "../components/ScreenContainer";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import {
  acceptCustomerOrderProposal,
  cancelCustomerOrder,
  completeCustomerOrder,
  declineCustomerOrderProposal,
  getCustomerOrderMessages,
  getCustomerOrders,
  refreshCustomerOrderPayment,
  sendCustomerOrderMessage,
} from "../services/orders.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  getStoreConversation,
  getStoreConversations,
  markStoreConversationRead,
} from "../services/store-chats.api";
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

const finalStatuses = new Set(["CONCLUIDO", "CANCELADO"]);

const statusCopy = {
  ACEITO: "Aceito pela loja",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluido",
  NEGOCIANDO: "Em negociacao",
  PREPARANDO: "Em preparo",
  PRONTO_RETIRADA: "Pronto para retirada",
  RECEBIDO: "Recebido pela loja",
  SAIU_ENTREGA: "Saiu para entrega",
};

function formatDateTime(value) {
  if (!value) {
    return "Agora";
  }

  return formatarDataHora(value) || "Agora";
}

function buildOrderMessages(order, persistedMessages = [], storeMessages = []) {
  if (!order) {
    return [];
  }

  const hasPersistedTimeline = persistedMessages.some((message) =>
    ["created", "status"].includes(message.metadata?.kind),
  );

  return [
    ...storeMessages.map(normalizeStoreConversationMessage),
    {
      id: `order-${order.id}-summary`,
      kind: "store",
      order,
      time: order.createdAt,
      title: "Resumo do pedido",
      type: "summary",
    },
    {
      id: `order-${order.id}-items`,
      kind: "store",
      order,
      time: order.createdAt,
      title: "Itens do pedido",
      type: "items",
    },
    ...(hasPersistedTimeline ? [] : buildStatusMessages(order)),
    ...persistedMessages.map(normalizeOrderMessage),
  ]
    .map((message, index) => ({ ...message, timelineIndex: index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.time ?? "") || 0;
      const rightTime = Date.parse(right.time ?? "") || 0;
      return leftTime - rightTime || left.timelineIndex - right.timelineIndex;
    });
}

function normalizeOrderMessage(message) {
  const kind = message.kind === "customer"
    ? "customer"
    : message.kind === "system"
      ? "system"
      : "store";

  return {
    id: `order-message-${message.id}`,
    attachment: message.attachment,
    kind,
    readAt: message.readAt,
    text: message.text,
    time: message.time ?? message.createdAt,
    title: message.title ?? (kind === "customer" ? "Voce" : "Loja"),
  };
}

function normalizeStoreConversationMessage(message) {
  const kind = message.author === "system"
    ? "system"
    : message.isMine || message.author === "customer"
      ? "customer"
      : "store";

  return {
    id: `store-message-${message.id}`,
    attachment: message.attachment,
    kind,
    readAt: message.readAt,
    text: message.text,
    time: message.createdAt,
    title: kind === "customer"
      ? "Voce"
      : kind === "system"
        ? "Atualizacao"
        : message.sentBy?.name ?? "Loja",
  };
}

function buildStatusMessages(order) {
  const messages = [
    {
      id: "created",
      kind: "system",
      text: "Recebemos seu pedido. A loja ja consegue acompanhar pelo painel.",
      time: order.createdAt,
      title: "Pedido recebido",
    },
  ];

  if (order.acceptedAt) {
    messages.push({
      id: "accepted",
      kind: "system",
      text: "A loja aceitou o pedido e vai iniciar o atendimento.",
      time: order.acceptedAt,
      title: "Pedido aceito",
    });
  }

  if (order.preparingAt) {
    messages.push({
      id: "preparing",
      kind: "system",
      text: "Seu pedido esta em preparo. Qualquer duvida voce pode mandar aqui.",
      time: order.preparingAt,
      title: "Em preparo",
    });
  }

  if (order.readyForPickupAt) {
    messages.push({
      id: "pickup",
      kind: "system",
      text: "Pedido pronto para retirada.",
      time: order.readyForPickupAt,
      title: "Pronto para retirada",
    });
  }

  if (order.shippedAt) {
    messages.push({
      id: "shipped",
      kind: "system",
      text: "Pedido saiu para entrega.",
      time: order.shippedAt,
      title: "Saiu para entrega",
    });
  }

  if (order.completedAt) {
    messages.push({
      id: "completed",
      kind: "system",
      text: "Pedido confirmado como recebido pelo cliente.",
      time: order.completedAt,
      title: "Concluido",
    });
  }

  if (order.canceledAt) {
    messages.push({
      id: "canceled",
      kind: "system",
      text: "Pedido cancelado. Fale com a loja por aqui se precisar entender o motivo.",
      time: order.canceledAt,
      title: "Cancelado",
    });
  }

  return messages;
}

function appendUniqueMessage(messages, nextMessage) {
  if (!nextMessage) {
    return messages;
  }

  if (messages.some((message) => message.id === nextMessage.id)) {
    return messages;
  }

  return [...messages, nextMessage];
}

function deliveryText(order) {
  if (order?.deliveryMode === "RETIRADA") {
    return "Retirada na loja";
  }

  const address = order?.address;

  if (!address) {
    return "Entrega";
  }

  return `${address.rua}, ${address.numero} - ${address.bairro}`;
}

function compactOrderCode(value = "") {
  if (!value) {
    return "Pedido criado";
  }

  const parts = String(value).split("-");
  const suffix = parts.at(-1);

  return suffix ? `#${suffix}` : value;
}

export function CustomerOrderDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const chatScrollRef = useRef(null);
  const skipNextAutomaticScrollRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [storeConversation, setStoreConversation] = useState(null);
  const [storeMessagePage, setStoreMessagePage] = useState({ hasMore: false, nextCursor: null });
  const [historyError, setHistoryError] = useState("");
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [proposalAction, setProposalAction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [order, setOrder] = useState(route.params?.order ?? null);
  const [paymentCheckMessage, setPaymentCheckMessage] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const lastAutomaticPaymentCheckAt = useRef(0);
  const routeConversationId = route.params?.conversationId ?? null;
  const orderStoreId = order?.storeId ?? order?.store?.id ?? null;

  useEffect(() => {
    if (!session?.accessToken || !orderStoreId) return undefined;
    let active = true;

    async function loadStoreHistory() {
      setHistoryError("");
      try {
        let conversationId = routeConversationId;
        if (!conversationId) {
          const listResponse = await getStoreConversations(session.accessToken, {
            storeId: orderStoreId,
          });
          conversationId = listResponse.conversations?.[0]?.id ?? null;
        }

        if (!conversationId) return;
        const response = await getStoreConversation(session.accessToken, conversationId);
        if (!active) return;
        setStoreConversation(response.conversation ?? null);
        setStoreMessagePage(response.messagePage ?? { hasMore: false, nextCursor: null });
      } catch (requestError) {
        if (active) {
          setHistoryError(requestError.message ?? "Nao foi possivel carregar o historico anterior.");
        }
      }
    }

    loadStoreHistory();
    return () => {
      active = false;
    };
  }, [orderStoreId, routeConversationId, session?.accessToken]);

  const loadOrder = useCallback(async ({ automaticPaymentCheck = false, checkPayment = false, silent = false } = {}) => {
    if (!session?.accessToken || !order?.id) {
      return;
    }

    setError("");
    if (checkPayment) {
      setPaymentCheckMessage("");
    }
    if (!silent) {
      setIsLoading(true);
    }

    const shouldCheckPayment = checkPayment
      && order.status === "AGUARDANDO_PAGAMENTO"
      && order.payment?.status === "AGUARDANDO_PAGAMENTO"
      && (!automaticPaymentCheck || Date.now() - lastAutomaticPaymentCheckAt.current >= 15000);

    if (shouldCheckPayment && automaticPaymentCheck) {
      lastAutomaticPaymentCheckAt.current = Date.now();
    }

    try {
      if (
        shouldCheckPayment
      ) {
        const paymentResponse = await refreshCustomerOrderPayment(
          session.accessToken,
          order.id,
        );

        if (paymentResponse.order) {
          setOrder(paymentResponse.order);
        }
        setPaymentCheckMessage(
          paymentResponse.paymentConfirmed
            ? "Pagamento confirmado pelo Asaas."
            : "O Pix ainda esta aguardando confirmacao.",
        );
      }

      const [messagesResponse, ordersResponse] = await Promise.all([
        getCustomerOrderMessages(session.accessToken, order.id),
        getCustomerOrders(session.accessToken),
      ]);
      const updatedOrder = (ordersResponse.orders ?? []).find((item) => item.id === order.id);

      if (updatedOrder) {
        setOrder(updatedOrder);
      }
      setChatMessages(messagesResponse.messages ?? []);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel atualizar o pedido.");
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [order?.id, order?.payment?.status, order?.status, session?.accessToken]);

  useFocusEffect(useCallback(() => {
    loadOrder({ automaticPaymentCheck: true, checkPayment: true });
  }, [loadOrder]));

  const handleRealtimeOrder = useCallback((payload) => {
    if (payload.order) {
      setOrder(payload.order);
    }

    loadOrder({ silent: true });
  }, [loadOrder]);

  const handleRealtimeMessage = useCallback((payload) => {
    setChatMessages((current) => appendUniqueMessage(current, payload.message));
    loadOrder({ silent: true });
  }, [loadOrder]);

  useRealtimeOrders({
    accessToken: session?.accessToken,
    onMessageEvent: handleRealtimeMessage,
    onOrderEvent: handleRealtimeOrder,
    orderId: order?.id,
  });

  useEffect(() => {
    if (!session?.accessToken || !storeConversation?.id) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const onMessage = (payload = {}) => {
      if (
        Number(payload.conversationId) !== Number(storeConversation.id)
        || !payload.message
      ) return;
      const message = {
        ...payload.message,
        isMine: Number(payload.senderUserId) === Number(session.user?.id),
      };
      setStoreConversation((current) => {
        if (
          !current
          || current.messages?.some((item) => Number(item.id) === Number(message.id))
        ) return current;
        return { ...current, messages: [...(current.messages ?? []), message] };
      });
      if (!message.isMine) {
        void markStoreConversationRead(session.accessToken, storeConversation.id).catch(() => {});
      }
    };
    socket?.on(realtimeEvents.storeChatMessageCreated, onMessage);
    return () => socket?.off(realtimeEvents.storeChatMessageCreated, onMessage);
  }, [session?.accessToken, session?.user?.id, storeConversation?.id]);

  const messages = useMemo(
    () => buildOrderMessages(order, chatMessages, storeConversation?.messages ?? []),
    [chatMessages, order, storeConversation?.messages],
  );

  async function loadOlderStoreHistory() {
    if (
      !session?.accessToken
      || !storeConversation?.id
      || !storeMessagePage.hasMore
      || !storeMessagePage.nextCursor
      || loadingOlderHistory
    ) return;

    setLoadingOlderHistory(true);
    setHistoryError("");
    try {
      const response = await getStoreConversation(
        session.accessToken,
        storeConversation.id,
        { beforeMessageId: storeMessagePage.nextCursor },
      );
      setStoreConversation((current) => {
        if (!current) return response.conversation ?? null;
        const knownIds = new Set((current.messages ?? []).map((item) => Number(item.id)));
        const olderMessages = (response.conversation?.messages ?? []).filter(
          (item) => !knownIds.has(Number(item.id)),
        );
        if (olderMessages.length) {
          skipNextAutomaticScrollRef.current = true;
        }
        return { ...current, messages: [...olderMessages, ...(current.messages ?? [])] };
      });
      setStoreMessagePage(response.messagePage ?? { hasMore: false, nextCursor: null });
    } catch (requestError) {
      setHistoryError(requestError.message ?? "Nao foi possivel carregar o historico anterior.");
    } finally {
      setLoadingOlderHistory(false);
    }
  }

  const scrollToLatest = useCallback(() => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (messages.length) {
      if (skipNextAutomaticScrollRef.current) {
        skipNextAutomaticScrollRef.current = false;
        return;
      }
      scrollToLatest();
    }
  }, [messages.length, scrollToLatest]);
  const isFinal = finalStatuses.has(order?.status);
  const canConfirmReceipt = ["SAIU_ENTREGA", "PRONTO_RETIRADA"].includes(order?.status);
  const paymentConfirmed = ["PAGO", "LIQUIDADO", "EM_DISPUTA", "ESTORNADO"].includes(
    order?.payment?.status,
  );
  const fulfillmentStarted = [
    "ACEITO",
    "PREPARANDO",
    "SAIU_ENTREGA",
    "PRONTO_RETIRADA",
    "CONCLUIDO",
  ].includes(order?.status);
  const canCancelDirectly = !isFinal && !paymentConfirmed && !fulfillmentStarted;
  const latestProposal = order?.latestProposal ?? order?.proposals?.at(-1) ?? null;
  const pendingProposal =
    latestProposal?.status === "PENDENTE" && order?.status === "NEGOCIANDO"
      ? latestProposal
      : null;

  function openProposalPayment(nextOrder = order, proposal = latestProposal) {
    if (!nextOrder || !proposal) {
      return;
    }

    navigation.navigate("CheckoutPayment", {
      conversationId: storeConversation?.id ?? routeConversationId,
      mode: "order-proposal",
      order: nextOrder,
      proposal,
      store: nextOrder.store,
      totals: {
        serviceFeeCents: nextOrder.serviceFeeCents ?? 0,
        totalCents: proposal.amountCents,
      },
    });
  }

  async function respondToProposal(action) {
    if (!session?.accessToken || !order?.id || !pendingProposal || proposalAction) {
      return;
    }

    setProposalAction(action);
    setError("");

    try {
      const request = action === "accept"
        ? acceptCustomerOrderProposal
        : declineCustomerOrderProposal;
      const response = await request(
        session.accessToken,
        order.id,
        pendingProposal.id,
      );

      if (response.order) {
        setOrder(response.order);
      }
      if (response.message) {
        setChatMessages((current) => appendUniqueMessage(current, response.message));
      }

      if (action === "accept") {
        openProposalPayment(
          response.order ?? order,
          response.order?.latestProposal ?? {
            ...pendingProposal,
            status: "ACEITA",
          },
        );
      }
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel responder a proposta.");
    } finally {
      setProposalAction("");
    }
  }

  async function confirmReceipt() {
    if (!session?.accessToken || !order?.id || isCompleting || !canConfirmReceipt) {
      return;
    }

    setIsCompleting(true);
    setError("");

    try {
      const response = await completeCustomerOrder(session.accessToken, order.id);
      const completedOrder = response.order ?? order;

      if (response.order) {
        setOrder(completedOrder);
      }
      await loadOrder({ silent: true });
      navigation.navigate("CustomerOrders", {
        highlightOrderId: completedOrder.id,
        initialView: "history",
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel confirmar o recebimento.");
    } finally {
      setIsCompleting(false);
    }
  }

  function requestCancellation() {
    if (canCancelDirectly) {
      Alert.alert(
        "Cancelar pedido?",
        "Como o pagamento ainda nao foi confirmado, o pedido sera encerrado agora.",
        [
          { style: "cancel", text: "Voltar" },
          { onPress: cancelBeforePayment, style: "destructive", text: "Cancelar pedido" },
        ],
      );
      return;
    }

    navigation.navigate("Suporte", { order });
  }

  async function cancelBeforePayment() {
    if (!session?.accessToken || !order?.id || isCanceling) {
      return;
    }

    setIsCanceling(true);
    setError("");

    try {
      const response = await cancelCustomerOrder(session.accessToken, order.id);
      setOrder(response.order ?? order);
      await loadOrder({ silent: true });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cancelar o pedido.");
    } finally {
      setIsCanceling(false);
    }
  }

  async function sendQuestion(payload = null) {
    const text = payload?.message ?? draft.trim();

    if ((!text && !payload?.attachment) || isSending || !session?.accessToken || !order?.id) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const response = await sendCustomerOrderMessage(session.accessToken, order.id, payload ?? text);
      setChatMessages((current) => appendUniqueMessage(current, response.message));
      setDraft("");
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel enviar a mensagem.");
      throw requestError;
    } finally {
      setIsSending(false);
    }
  }

  if (!order) {
    return (
      <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
        <View style={styles.stateCard}>
          <Ionicons color={colors.danger} name="receipt-outline" size={32} />
          <Text style={styles.errorText}>Pedido nao encontrado.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(spacing.xxxl, insets.bottom + spacing.lg) },
      ]}
      edges={["left", "right"]}
      onContentSizeChange={scrollToLatest}
      scrollViewRef={chatScrollRef}
    >
      <View style={styles.chatShell}>
        <View style={styles.conversationHeader}>
          <View style={styles.storeIcon}>
            <Ionicons color={colors.primaryDark} name="storefront-outline" size={22} />
          </View>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.storeName}>{order.store?.name ?? "Loja"}</Text>
            <Text style={styles.orderCode}>{order.code ?? "Pedido"}</Text>
          </View>
          <View style={[styles.statusPill, isFinal ? styles.statusFinal : styles.statusActive]}>
            <Text style={[styles.statusText, isFinal ? styles.statusFinalText : styles.statusActiveText]}>
              {statusCopy[order.status] ?? order.status}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Atualizar pedido e verificar pagamento"
            onPress={() => loadOrder({ checkPayment: true })}
            style={({ pressed }) => [styles.reloadButton, pressed && styles.pressed]}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryDark} size="small" />
            ) : (
              <Ionicons color={colors.primaryDark} name="refresh-outline" size={19} />
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {paymentCheckMessage ? (
          <Text style={styles.localHint}>{paymentCheckMessage}</Text>
        ) : null}

        {latestProposal ? (
          <OrderProposalCard
            loading={Boolean(proposalAction)}
            onAccept={() => respondToProposal("accept")}
            onDecline={() => respondToProposal("decline")}
            onPay={() => openProposalPayment()}
            orderStatus={order.status}
            proposal={latestProposal}
          />
        ) : null}

        {canConfirmReceipt ? (
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={22} />
            </View>
            <View style={styles.confirmCopy}>
              <Text style={styles.confirmTitle}>
                {order.status === "PRONTO_RETIRADA" ? "Retirou seu pedido?" : "Recebeu seu pedido?"}
              </Text>
              <Text style={styles.confirmText}>
                Confirme somente quando o pedido estiver com voce. A loja sera avisada na hora.
              </Text>
            </View>
            <AppButton
              icon="checkmark-circle-outline"
              loading={isCompleting}
              onPress={confirmReceipt}
              style={styles.confirmButton}
              title="Recebi meu pedido"
              variant="primary"
            />
          </View>
        ) : null}

        <View style={styles.messages}>
          {storeMessagePage.hasMore ? (
            <Pressable
              disabled={loadingOlderHistory}
              onPress={loadOlderStoreHistory}
              style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            >
              {loadingOlderHistory ? (
                <ActivityIndicator color={colors.primaryDark} size="small" />
              ) : (
                <Ionicons color={colors.primaryDark} name="time-outline" size={18} />
              )}
              <Text style={styles.historyButtonText}>Carregar conversas anteriores</Text>
            </Pressable>
          ) : null}
          {historyError ? <Text style={styles.historyError}>{historyError}</Text> : null}
          {messages.map((message) => (
            <MessageBubble accessToken={session.accessToken} key={message.id} message={message} />
          ))}
        </View>

        <ChatComposer
          draft={draft}
          onAttachmentError={setError}
          onChangeDraft={setDraft}
          onFocus={() => setTimeout(scrollToLatest, 120)}
          onSend={sendQuestion}
          onSendAttachment={sendQuestion}
          placeholder="Escreva uma duvida para a loja"
          sending={isSending}
          style={{ paddingBottom: spacing.sm }}
        />

        {order.status !== "CANCELADO" ? (
          <View style={styles.supportSection}>
            <Pressable
              accessibilityLabel={supportOpen ? "Fechar ajuda e suporte" : "Abrir ajuda e suporte"}
              accessibilityState={{ expanded: supportOpen }}
              onPress={() => setSupportOpen((current) => !current)}
              style={({ pressed }) => [styles.supportToggle, pressed && styles.pressed]}
            >
              <View style={styles.supportIcon}>
                <Ionicons color={colors.primaryDark} name="headset-outline" size={19} />
              </View>
              <View style={styles.supportCopy}>
                <Text style={styles.supportTitle}>Ajuda e suporte</Text>
                <Text style={styles.supportSubtitle}>Duvidas, problemas ou cancelamento</Text>
              </View>
              <Ionicons
                color={colors.textMuted}
                name={supportOpen ? "chevron-up" : "chevron-down"}
                size={19}
              />
            </Pressable>

            {supportOpen ? (
              <View style={styles.cancellationCard}>
                <View style={styles.cancellationCopy}>
                  <Text style={styles.cancellationTitle}>
                    {canCancelDirectly ? "Cancelar este pedido" : "Solicitar cancelamento"}
                  </Text>
                  <Text style={styles.cancellationText}>
                    {canCancelDirectly
                      ? "Como o pagamento ainda nao foi confirmado, o cancelamento e imediato."
                      : "Pedidos pagos ou em atendimento sao analisados pelo suporte. Se a loja nao iniciar no prazo, o sistema cancela e estorna automaticamente."}
                  </Text>
                </View>
                <AppButton
                  icon={canCancelDirectly ? "close-circle-outline" : "headset-outline"}
                  loading={isCanceling}
                  onPress={requestCancellation}
                  title={canCancelDirectly ? "Cancelar pedido" : "Falar com o suporte"}
                  variant="outline"
                />
              </View>
            ) : null}
          </View>
        ) : null}

      </View>

      <ProposalDecisionModal
        loading={Boolean(proposalAction)}
        onAccept={() => respondToProposal("accept")}
        onDecline={() => respondToProposal("decline")}
        proposal={pendingProposal}
      />
    </ScreenContainer>
  );
}

function OrderProposalCard({ loading, onAccept, onDecline, onPay, orderStatus, proposal }) {
  const pending = proposal.status === "PENDENTE";
  const accepted = proposal.status === "ACEITA" && orderStatus === "AGUARDANDO_PAGAMENTO";

  return (
    <View style={styles.proposalCard}>
      <View style={styles.proposalHeader}>
        <View style={styles.proposalIcon}>
          <Ionicons color={colors.primaryDark} name="receipt-outline" size={21} />
        </View>
        <View style={styles.proposalCopy}>
          <Text style={styles.proposalEyebrow}>
            {pending ? "Nova proposta da loja" : accepted ? "Proposta aceita" : "Proposta do pedido"}
          </Text>
          <Text style={styles.proposalAmount}>{formatarDinheiro(proposal.amountCents)}</Text>
        </View>
        <View style={styles.proposalStatus}>
          <Text style={styles.proposalStatusText}>{proposalStatusLabel(proposal)}</Text>
        </View>
      </View>
      {proposal.description ? (
        <Text style={styles.proposalDescription}>{proposal.description}</Text>
      ) : null}
      {pending ? (
        <View style={styles.proposalActions}>
          <AppButton
            disabled={loading}
            onPress={onDecline}
            style={styles.proposalAction}
            title="Recusar"
            variant="outline"
          />
          <AppButton
            disabled={loading}
            loading={loading}
            onPress={onAccept}
            style={styles.proposalAction}
            title="Aceitar e pagar"
          />
        </View>
      ) : null}
      {accepted ? (
        <AppButton icon="wallet-outline" onPress={onPay} title="Continuar pagamento" />
      ) : null}
    </View>
  );
}

function ProposalDecisionModal({ loading, onAccept, onDecline, proposal }) {
  return (
    <Modal animationType="fade" transparent visible={Boolean(proposal)}>
      <View style={styles.proposalModalBackdrop}>
        <View style={styles.proposalModal}>
          <View style={styles.proposalModalIcon}>
            <Ionicons color={colors.primaryDark} name="chatbubble-ellipses-outline" size={25} />
          </View>
          <Text style={styles.proposalModalEyebrow}>A loja respondeu seu pedido</Text>
          <Text style={styles.proposalModalTitle}>Confira a proposta</Text>
          <Text style={styles.proposalModalAmount}>
            {formatarDinheiro(proposal?.amountCents ?? 0)}
          </Text>
          {proposal?.description ? (
            <Text style={styles.proposalModalDescription}>{proposal.description}</Text>
          ) : null}
          <Text style={styles.proposalModalHint}>
            Aceite para escolher saldo ou Pix. Se algo estiver diferente, recuse e continue falando com a loja.
          </Text>
          <View style={styles.proposalActions}>
            <AppButton
              disabled={loading}
              onPress={onDecline}
              style={styles.proposalAction}
              title="Recusar"
              variant="outline"
            />
            <AppButton
              disabled={loading}
              loading={loading}
              onPress={onAccept}
              style={styles.proposalAction}
              title="Aceitar e pagar"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function proposalStatusLabel(proposal) {
  if (proposal.status === "PAGA") return "Pago";
  if (proposal.status === "ACEITA") return "Aceita";
  if (proposal.status === "RECUSADA") return "Recusada";
  if (proposal.status === "CANCELADA") return "Substituida";
  return "Para decidir";
}

function MessageBubble({ accessToken, message }) {
  const isCustomer = message.kind === "customer";
  const isSystem = message.kind === "system";
  const isRichMessage = message.type === "summary" || message.type === "items";

  if (isSystem) {
    return (
      <ChatSystemMessage
        icon="sparkles-outline"
        text={message.text}
        time={formatDateTime(message.time)}
        title={message.title}
      />
    );
  }

  return (
    <View style={[styles.messageRow, isCustomer && styles.messageRowCustomer]}>
      {!isCustomer && !isRichMessage ? (
        <View style={styles.messageAvatar}>
          <Ionicons color={colors.primaryDark} name="storefront-outline" size={16} />
        </View>
      ) : null}
      <View style={[
        styles.messageBubble,
        isRichMessage && styles.richMessageBubble,
        isCustomer ? styles.customerBubble : styles.storeBubble,
      ]}>
        <Text style={[styles.messageTitle, isCustomer && styles.customerMessageTitle]}>
          {message.title}
        </Text>
        <ChatAttachment accessToken={accessToken} attachment={message.attachment} isMine={isCustomer} />
        {message.type === "summary" ? (
          <OrderSummaryMessage order={message.order} />
        ) : null}
        {message.type === "items" ? (
          <OrderItemsMessage order={message.order} />
        ) : null}
        {!isRichMessage && message.text ? (
          <Text style={[styles.messageText, isCustomer && styles.customerMessageText]}>
            {message.text}
          </Text>
        ) : null}
        <ChatMessageMeta createdAt={message.time} isMine={isCustomer} readAt={message.readAt} />
      </View>
    </View>
  );
}

function OrderSummaryMessage({ order }) {
  return (
    <View style={styles.richMessage}>
      <View style={styles.summaryLine}>
        <View style={styles.summaryCodePill}>
          <Ionicons color={colors.primaryDark} name="receipt-outline" size={14} />
          <Text style={styles.summaryCodeText}>{compactOrderCode(order.code)}</Text>
        </View>
        <Text style={styles.summaryStatusText}>{statusCopy[order.status] ?? order.status}</Text>
      </View>
      <OrderProgress order={order} />
      <BubbleDetail label="Total" value={formatarDinheiro(order.totalCents)} />
      <BubbleDetail label="Entrega" value={deliveryText(order)} />
      <PaymentBreakdown order={order} />
    </View>
  );
}

function OrderProgress({ order }) {
  const { width, fontScale } = useWindowDimensions();
  const vertical = width < 360 || fontScale > 1.2;
  const pickup = order.deliveryMode === "RETIRADA";
  const steps = [
    { status: "RECEBIDO", label: "Recebido", icon: "receipt-outline" },
    { status: "ACEITO", label: "Aceito", icon: "checkmark-circle-outline" },
    { status: "PREPARANDO", label: "Em preparo", icon: "cube-outline" },
    { status: pickup ? "PRONTO_RETIRADA" : "SAIU_ENTREGA", label: pickup ? "Retirada" : "A caminho", icon: pickup ? "storefront-outline" : "bicycle-outline" },
    { status: "CONCLUIDO", label: pickup ? "Retirado" : "Entregue", icon: "bag-check-outline" },
  ];
  const currentIndex = steps.findIndex((step) => step.status === order.status);
  const canceled = order.status === "CANCELADO";
  const hints = {
    NEGOCIANDO: "Aguardando a definição dos detalhes com a loja.",
    AGUARDANDO_PAGAMENTO: "Aguardando a confirmação do pagamento para continuar.",
    RECEBIDO: "Pedido recebido. Aguardando a loja aceitar.",
    ACEITO: "A loja aceitou seu pedido. O preparo começa em breve.",
    PREPARANDO: "A loja está preparando seu pedido.",
    SAIU_ENTREGA: "Seu pedido saiu para entrega e está a caminho.",
    PRONTO_RETIRADA: "Tudo pronto! Você já pode retirar na loja.",
    CONCLUIDO: pickup ? "Retirada confirmada. Pedido concluído." : "Recebimento confirmado. Pedido concluído.",
    CANCELADO: "Pedido cancelado. Confira abaixo a situação do pagamento.",
  };

  return (
    <View style={styles.progressCard}>
      <View style={styles.paymentBoxHeader}>
        <Ionicons color={canceled ? colors.danger : colors.primaryDark} name={canceled ? "close-circle-outline" : "navigate-outline"} size={17} />
        <Text style={styles.paymentBoxTitle}>{canceled ? "Pedido cancelado" : "Acompanhe seu pedido"}</Text>
      </View>
      {!canceled ? (
        <View style={[styles.progressSteps, vertical && styles.progressStepsVertical]}>
          {steps.map((step, index) => {
            const reached = index <= currentIndex;
            const current = index === currentIndex;
            return (
              <View
                accessibilityLabel={`${step.label}: ${current ? "etapa atual" : reached ? "concluído" : "aguardando"}`}
                accessible
                key={step.status}
                style={[styles.progressStep, vertical && styles.progressStepVertical]}
              >
                {index > 0 ? <View style={[styles.progressLineBefore, vertical && styles.progressLineBeforeVertical, reached && styles.progressLineDone]} /> : null}
                {index < steps.length - 1 ? <View style={[styles.progressLineAfter, vertical && styles.progressLineAfterVertical, index < currentIndex && styles.progressLineDone]} /> : null}
                <View style={[styles.progressDot, reached && styles.progressDotDone, current && styles.progressDotCurrent]}>
                  <Ionicons color={reached ? colors.card : colors.textMuted} name={step.icon} size={17} />
                </View>
                <Text style={[styles.progressLabel, vertical && styles.progressLabelVertical, reached && styles.progressLabelDone]}>{step.label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <Text accessibilityLiveRegion="polite" style={styles.progressHint}>{hints[order.status] ?? statusCopy[order.status] ?? "Aguardando atualização da loja."}</Text>
    </View>
  );
}

function PaymentBreakdown({ order }) {
  const payment = order.payment;
  const confirmed = ["PAGO", "LIQUIDADO"].includes(payment?.status);
  const statusDetails = {
    PAGO: { label: "Pagamento confirmado", icon: "checkmark-circle", color: colors.primaryDark },
    LIQUIDADO: { label: "Pagamento confirmado", icon: "checkmark-circle", color: colors.primaryDark },
    PENDENTE: { label: "Pagamento pendente", icon: "time-outline", color: "#9A5B00" },
    AGUARDANDO_PAGAMENTO: { label: "Aguardando pagamento", icon: "time-outline", color: "#9A5B00" },
    EM_RECONCILIACAO: { label: "Conferindo pagamento", icon: "sync-outline", color: colors.info },
    ESTORNADO: { label: "Pagamento estornado", icon: "return-down-back-outline", color: colors.info },
    CANCELADO: { label: "Pagamento cancelado", icon: "close-circle-outline", color: colors.danger },
    FALHOU: { label: "Pagamento não concluído", icon: "alert-circle-outline", color: colors.danger },
    EM_DISPUTA: { label: "Pagamento em análise", icon: "shield-outline", color: "#9A5B00" },
  };
  const details = statusDetails[payment?.status] ?? {
    label: payment ? "Situação do pagamento indisponível" : "Sem pagamento registrado",
    icon: "card-outline",
    color: colors.textSecondary,
  };

  return (
    <View style={[styles.paymentBox, confirmed && styles.paymentBoxConfirmed]}>
      <View style={styles.paymentBoxHeader}>
        <Ionicons color={details.color} name={details.icon} size={21} />
        <Text accessibilityLiveRegion="polite" style={[styles.paymentBoxTitle, { color: details.color }]}>{details.label}</Text>
      </View>
      {confirmed && order.paidAt ? <Text style={styles.paymentLabel}>Confirmado em {formatDateTime(order.paidAt)}</Text> : null}
      {payment ? (
        <>
          <Text style={styles.paymentLabel}>{confirmed ? "Como foi pago" : payment.status === "ESTORNADO" ? "Composição do pagamento estornado" : "Composição do pagamento"}</Text>
          <View style={styles.paymentValues}>
            <PaymentValue label="Saldo" value={formatarDinheiro(payment.balanceCents)} />
            <View style={styles.paymentDivider} />
            <PaymentValue label="Pix" value={formatarDinheiro(payment.pixCents)} />
            <View style={styles.paymentDivider} />
            <PaymentValue label="Total" strong value={formatarDinheiro(payment.totalCents)} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function PaymentValue({ label, strong = false, value }) {
  return (
    <View style={styles.paymentValue}>
      <Text style={styles.paymentLabel}>{label}</Text>
      <Text style={[styles.paymentAmount, strong && styles.paymentAmountStrong]}>{value}</Text>
    </View>
  );
}

function OrderItemsMessage({ order }) {
  return (
    <View style={styles.richMessage}>
      {(order.items ?? []).map((item) => (
        <View key={item.id} style={styles.bubbleItemRow}>
          <View style={styles.bubbleItemQty}>
            <Text style={styles.bubbleItemQtyText}>{item.quantity}x</Text>
          </View>
          <View style={styles.bubbleItemCopy}>
            <Text style={styles.bubbleItemName}>{item.name}</Text>
            {item.notes ? <Text style={styles.bubbleItemNotes}>{item.notes}</Text> : null}
          </View>
          <Text style={styles.bubbleItemPrice}>{formatarDinheiro(item.totalCents)}</Text>
        </View>
      ))}
    </View>
  );
}

function BubbleDetail({ label, value }) {
  return (
    <View style={styles.bubbleDetail}>
      <Text style={styles.bubbleDetailLabel}>{label}</Text>
      <Text style={styles.bubbleDetailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cancellationCard: {
    backgroundColor: "#FFF9F2",
    borderColor: "#F4D7B0",
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  cancellationCopy: {
    gap: spacing.xs,
  },
  cancellationText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  cancellationTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  supportCopy: {
    flex: 1,
    gap: 2,
  },
  supportIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  supportSection: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  supportSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  supportTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  supportToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.xs,
  },
  bubbleDetail: {
    alignItems: "flex-start",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: 7,
  },
  bubbleDetailLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 10,
    width: 52,
  },
  bubbleDetailValue: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17,
  },
  bubbleItemCopy: {
    flex: 1,
    gap: 2,
  },
  bubbleItemName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  bubbleItemNotes: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  bubbleItemPrice: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  bubbleItemQty: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  bubbleItemQtyText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
    fontWeight: "800",
  },
  bubbleItemRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  chatShell: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
    ...shadow,
  },
  conversationHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  confirmButton: {
    alignSelf: "stretch",
  },
  confirmCard: {
    backgroundColor: "#F0FDF4",
    borderColor: colors.primaryLight,
    borderRadius: 20,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  confirmCopy: {
    gap: spacing.xs,
  },
  confirmIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  confirmText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  confirmTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  customerBubble: {
    backgroundColor: colors.primaryDark,
    borderBottomRightRadius: radius.sm,
  },
  customerMessageText: {
    color: colors.card,
  },
  customerMessageTime: {
    color: "rgba(255,255,255,0.68)",
  },
  customerMessageTitle: {
    color: colors.card,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
    textAlign: "center",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  historyButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyButtonText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  historyError: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "center",
  },
  localHint: {
    color: colors.textWeak,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "center",
  },
  messageAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  messageBubble: {
    borderRadius: 16,
    gap: 3,
    maxWidth: "80%",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
  },
  messageRowCustomer: {
    justifyContent: "flex-end",
  },
  messages: {
    backgroundColor: "#FBFCFB",
    borderRadius: radius.lg,
    gap: 10,
    padding: spacing.sm,
  },
  messageText: {
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
  },
  messageTime: {
    alignSelf: "flex-end",
    color: colors.textWeak,
    fontFamily: fonts.medium,
    fontSize: 9,
  },
  messageTitle: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  orderCode: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  pressed: {
    opacity: 0.78,
  },
  paymentAmount: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  paymentAmountStrong: {
    color: colors.primaryDark,
  },
  paymentBox: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  paymentBoxConfirmed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
  },
  progressCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  progressSteps: {
    flexDirection: "row",
  },
  progressStepsVertical: {
    flexDirection: "column",
  },
  progressStep: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  progressStepVertical: {
    flex: 0,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
  },
  progressDot: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.round,
    width: 30,
    height: 30,
  },
  progressDotDone: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  progressDotCurrent: {
    borderColor: colors.primaryLight,
    borderWidth: 3,
  },
  progressLineBefore: {
    position: "absolute",
    backgroundColor: colors.border,
    height: 3,
    top: 14,
    left: 0,
    right: "50%",
  },
  progressLineAfter: {
    position: "absolute",
    backgroundColor: colors.border,
    height: 3,
    top: 14,
    left: "50%",
    right: 0,
  },
  progressLineBeforeVertical: {
    top: 0,
    bottom: "50%",
    left: 14,
    right: undefined,
    height: "auto",
    width: 3,
  },
  progressLineAfterVertical: {
    top: "50%",
    bottom: 0,
    left: 14,
    right: undefined,
    height: "auto",
    width: 3,
  },
  progressLineDone: {
    backgroundColor: colors.primaryDark,
  },
  progressLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    textAlign: "center",
    alignSelf: "stretch",
  },
  progressLabelVertical: {
    flex: 1,
    alignSelf: "auto",
    textAlign: "left",
    fontSize: typography.caption,
  },
  progressLabelDone: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
  },
  progressHint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  paymentBoxHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  paymentBoxTitle: {
    flex: 1,
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  paymentDivider: {
    backgroundColor: colors.border,
    height: 28,
    width: 1,
  },
  paymentLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  paymentValue: {
    flex: 1,
    minWidth: 65,
    gap: 2,
  },
  paymentValues: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  proposalAction: {
    flex: 1,
  },
  proposalActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  proposalAmount: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  proposalCard: {
    backgroundColor: "#F0FDF4",
    borderColor: colors.primaryLight,
    borderRadius: 20,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  proposalCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  proposalDescription: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  proposalEyebrow: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  proposalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  proposalIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  proposalModal: {
    backgroundColor: colors.card,
    borderRadius: 24,
    gap: spacing.md,
    maxWidth: 440,
    padding: spacing.xl,
    width: "92%",
    ...shadow,
  },
  proposalModalAmount: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 32,
    fontWeight: "800",
  },
  proposalModalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.52)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  proposalModalDescription: {
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: typography.body,
    lineHeight: 22,
  },
  proposalModalEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  proposalModalHint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
  },
  proposalModalIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  proposalModalTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  proposalStatus: {
    backgroundColor: colors.card,
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  proposalStatusText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  questionBox: {
    alignItems: "flex-end",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  questionInput: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    maxHeight: 92,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: "top",
  },
  reloadButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  richMessage: {
    gap: 7,
    minWidth: 0,
  },
  richMessageBubble: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  sendButtonDisabled: {
    backgroundColor: colors.textWeak,
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
  statusActive: {
    backgroundColor: "#EFF6FF",
  },
  statusActiveText: {
    color: colors.info,
  },
  statusFinal: {
    backgroundColor: "#F3F4F6",
  },
  statusFinalText: {
    color: colors.textSecondary,
  },
  statusPill: {
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusText: {
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  storeBubble: {
    backgroundColor: "#F8FAFC",
    borderBottomLeftRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
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
  summaryCodePill: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  summaryCodeText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  summaryLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  summaryStatusText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
});
