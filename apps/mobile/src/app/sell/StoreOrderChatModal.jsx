import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../components/AppButton";
import { ChatSystemMessage } from "../../components/ChatSystemMessage";
import { useRealtimeOrders } from "../../hooks/useRealtimeOrders";
import {
  createStoreOrderProposal,
  getStoreOrderMessages,
  sendStoreOrderMessage,
} from "../../services/seller.api";
import { formatarDinheiro } from "../../utils/money";
import { colors, spacing } from "../../utils/theme";
import { sellerStyles as styles } from "./seller.styles";
import {
  appendUniqueSellerMessage,
  buildSellerOrderMessages,
  centsToInput,
  compactOrderCode,
  formatOrderDateTime,
  formatOrderStatus,
  normalizeSellerOrderMessage,
  parseMoneyToCents,
} from "./seller.utils";

export function StoreOrderChatModal({
  accessToken,
  onClose,
  onMessagesRead,
  open,
  order,
  store,
}) {
  const insets = useSafeAreaInsets();
  const chatScrollRef = useRef(null);
  const [chatError, setChatError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSendingProposal, setIsSendingProposal] = useState(false);
  const [liveOrder, setLiveOrder] = useState(order);
  const [proposalDescription, setProposalDescription] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalValue, setProposalValue] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => {
    setLiveOrder(order);
    if (!proposalOpen && order?.totalCents) {
      setProposalValue(centsToInput(order.totalCents));
    }
  }, [order, proposalOpen]);

  useEffect(() => {
    if (!open) {
      setChatError("");
      setChatMessages([]);
      setProposalDescription("");
      setProposalOpen(false);
      setReply("");
    }
  }, [open]);

  const scrollToLatest = useCallback(() => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (open && order) {
      scrollToLatest();
    }
  }, [chatMessages.length, liveOrder?.status, open, order, scrollToLatest]);

  const loadMessages = useCallback(async ({ silent = false } = {}) => {
    if (!accessToken || !open || !order?.id || !store?.id) return;

    setChatError("");
    if (!silent) setIsLoadingMessages(true);

    try {
      const response = await getStoreOrderMessages(accessToken, store.id, order.id);
      setChatMessages(response.messages ?? []);
      onMessagesRead?.();
    } catch (requestError) {
      if (!silent) {
        setChatError(requestError.message ?? "Nao foi possivel carregar a conversa.");
      }
    } finally {
      if (!silent) setIsLoadingMessages(false);
    }
  }, [accessToken, onMessagesRead, open, order?.id, store?.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleRealtimeMessage = useCallback((payload) => {
    setChatMessages((current) => appendUniqueSellerMessage(current, payload.message));
    loadMessages({ silent: true });
  }, [loadMessages]);

  const handleRealtimeOrder = useCallback((payload) => {
    if (payload.order) setLiveOrder(payload.order);
    loadMessages({ silent: true });
  }, [loadMessages]);

  useRealtimeOrders({
    accessToken,
    active: open,
    onMessageEvent: handleRealtimeMessage,
    onOrderEvent: handleRealtimeOrder,
    orderId: order?.id,
    storeId: store?.id,
  });

  if (!order) return null;

  const visibleOrder = liveOrder ?? order;
  const latestProposal = visibleOrder?.latestProposal ?? visibleOrder?.proposals?.at(-1) ?? null;
  const hasPersistedTimeline = chatMessages.some((message) =>
    ["created", "status"].includes(message.metadata?.kind),
  );
  const messages = [
    ...buildSellerOrderMessages(visibleOrder, { includeStatus: !hasPersistedTimeline }),
    ...chatMessages.map(normalizeSellerOrderMessage),
  ];

  async function sendReply() {
    const text = reply.trim();
    if (!text || isSendingReply || !accessToken || !store?.id || !order?.id) return;

    setIsSendingReply(true);
    setChatError("");

    try {
      const response = await sendStoreOrderMessage(accessToken, store.id, order.id, text);
      setChatMessages((current) => appendUniqueSellerMessage(current, response.message));
      setReply("");
    } catch (requestError) {
      setChatError(requestError.message ?? "Nao foi possivel enviar a resposta.");
    } finally {
      setIsSendingReply(false);
    }
  }

  async function sendProposal() {
    const amountCents = parseMoneyToCents(proposalValue);
    if (amountCents < 100 || isSendingProposal || !accessToken || !store?.id || !visibleOrder?.id) {
      setChatError("Informe um valor valido para a proposta.");
      return;
    }

    setIsSendingProposal(true);
    setChatError("");

    try {
      const response = await createStoreOrderProposal(
        accessToken,
        store.id,
        visibleOrder.id,
        { amountCents, description: proposalDescription.trim() },
      );

      if (response.order) setLiveOrder(response.order);
      if (response.message) {
        setChatMessages((current) => appendUniqueSellerMessage(current, response.message));
      }
      setProposalDescription("");
      setProposalOpen(false);
    } catch (requestError) {
      setChatError(requestError.message ?? "Nao foi possivel enviar a proposta.");
    } finally {
      setIsSendingProposal(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.modalBackdrop,
          { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) },
        ]}
      >
        <View style={styles.orderChatModal}>
          <View style={styles.orderChatHeader}>
            <View style={styles.orderChatAvatar}>
              <Ionicons color={colors.primaryDark} name="person-outline" size={21} />
            </View>
            <View style={styles.orderChatHeaderCopy}>
              <Text numberOfLines={1} style={styles.orderChatTitle}>
                {order.customer?.name ?? "Cliente"}
              </Text>
              <Text style={styles.orderChatSubtitle}>
                {compactOrderCode(visibleOrder.code)} - {formatOrderStatus(visibleOrder.status)}
              </Text>
            </View>
            <Pressable onPress={loadMessages} style={styles.modalClose}>
              {isLoadingMessages ? (
                <ActivityIndicator color={colors.primaryDark} size="small" />
              ) : (
                <Ionicons color={colors.primaryDark} name="refresh-outline" size={19} />
              )}
            </Pressable>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          {visibleOrder.status === "NEGOCIANDO" ? (
            <View style={styles.orderProposalBar}>
              <View style={styles.orderProposalBarIcon}>
                <Ionicons color={colors.primaryDark} name="receipt-outline" size={19} />
              </View>
              <View style={styles.orderProposalBarCopy}>
                <Text style={styles.orderProposalBarTitle}>
                  {latestProposal?.status === "PENDENTE"
                    ? "Proposta enviada"
                    : "Pedido aguardando proposta"}
                </Text>
                <Text style={styles.orderProposalBarText}>
                  {latestProposal?.status === "PENDENTE"
                    ? `${formatarDinheiro(latestProposal.amountCents)} - aguardando o cliente`
                    : "Confira os itens e envie o valor final pelo chat."}
                </Text>
              </View>
              {latestProposal?.status !== "PENDENTE" ? (
                <Pressable
                  onPress={() => setProposalOpen((current) => !current)}
                  style={styles.orderProposalButton}
                >
                  <Ionicons color={colors.card} name="add" size={17} />
                  <Text style={styles.orderProposalButtonText}>Propor</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {visibleOrder.status === "AGUARDANDO_PAGAMENTO" ? (
            <View style={styles.orderProposalWaiting}>
              <Ionicons color={colors.info} name="time-outline" size={18} />
              <Text style={styles.orderProposalWaitingText}>
                Proposta aceita. Aguardando o pagamento online do cliente.
              </Text>
            </View>
          ) : null}

          {proposalOpen ? (
            <View style={styles.orderProposalForm}>
              <View style={styles.orderProposalField}>
                <Text style={styles.orderProposalLabel}>Valor final ao cliente</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={setProposalValue}
                  placeholder="0,00"
                  placeholderTextColor={colors.textWeak}
                  style={styles.orderProposalInput}
                  value={proposalValue}
                />
                <Text style={styles.orderProposalBarText}>
                  Inclua a taxa de servico de {formatarDinheiro(visibleOrder.serviceFeeCents ?? 0)} neste total.
                </Text>
              </View>
              <View style={styles.orderProposalFieldWide}>
                <Text style={styles.orderProposalLabel}>Resumo da proposta</Text>
                <TextInput
                  onChangeText={setProposalDescription}
                  placeholder="Prazo, entrega ou ajuste combinado"
                  placeholderTextColor={colors.textWeak}
                  style={styles.orderProposalInput}
                  value={proposalDescription}
                />
              </View>
              <AppButton
                icon="send-outline"
                loading={isSendingProposal}
                onPress={sendProposal}
                style={styles.orderProposalSubmit}
                title="Enviar proposta"
              />
            </View>
          ) : null}

          <ScrollView
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={styles.orderChatBody}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToLatest}
            ref={chatScrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.orderChatScroll}
          >
            {chatError ? <Text style={styles.modalError}>{chatError}</Text> : null}
            {messages.map((message) => (
              <SellerChatBubble key={message.id} message={message} />
            ))}
          </ScrollView>

          <View style={styles.orderChatInputRow}>
            <TextInput
              multiline
              onChangeText={setReply}
              onFocus={() => setTimeout(scrollToLatest, 120)}
              placeholder="Responder ao cliente"
              placeholderTextColor={colors.textWeak}
              style={styles.orderChatInput}
              value={reply}
            />
            <Pressable
              disabled={!reply.trim() || isSendingReply}
              onPress={sendReply}
              style={({ pressed }) => [
                styles.orderChatSend,
                (!reply.trim() || isSendingReply) && styles.orderChatSendDisabled,
                pressed && reply.trim() && !isSendingReply && styles.pressed,
              ]}
            >
              {isSendingReply ? (
                <ActivityIndicator color={colors.card} size="small" />
              ) : (
                <Ionicons color={colors.card} name="send" size={17} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SellerChatBubble({ message }) {
  const fromStore = message.author === "store";
  const fromSystem = message.author === "system";

  if (fromSystem) {
    return (
      <ChatSystemMessage
        icon="sparkles-outline"
        text={message.text}
        time={formatOrderDateTime(message.time)}
        title={message.title}
      />
    );
  }

  return (
    <View style={[styles.sellerChatRow, fromStore && styles.sellerChatRowStore]}>
      {!fromStore ? (
        <View style={styles.sellerChatAvatar}>
          <Ionicons color={colors.primaryDark} name="person-outline" size={15} />
        </View>
      ) : null}
      <View style={[
        styles.sellerChatBubble,
        fromStore ? styles.sellerChatBubbleStore : styles.sellerChatBubbleClient,
      ]}>
        <Text style={[
          styles.sellerChatBubbleTitle,
          fromStore && styles.sellerChatBubbleTitleStore,
        ]}>
          {message.title}
        </Text>
        <Text style={[
          styles.sellerChatBubbleText,
          fromStore && styles.sellerChatBubbleTextStore,
        ]}>
          {message.text}
        </Text>
        <Text style={[
          styles.sellerChatBubbleTime,
          fromStore && styles.sellerChatBubbleTimeStore,
        ]}>
          {formatOrderDateTime(message.time)}
        </Text>
      </View>
    </View>
  );
}
