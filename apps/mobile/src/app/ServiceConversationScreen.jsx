import Ionicons from "@expo/vector-icons/Ionicons";
import { useFeedback } from "../components/FeedbackProvider";
import { serviceActionFeedback } from "../utils/action-feedback";
import { serviceFundsCopy } from "../utils/service-funds";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../components/AppButton";
import { BackHeader } from "../components/BackHeader";
import { ChatComposer } from "../components/ChatComposer";
import { ChatAttachment } from "../components/ChatAttachment";
import { ChatMessageMeta } from "../components/ChatMessageMeta";
import { ChatScrollToLatestButton } from "../components/ChatScrollToLatestButton";
import { ChatTypingIndicator } from "../components/ChatTypingIndicator";
import { ScreenContainer } from "../components/ScreenContainer";
import { ServiceCashbackNotice } from "../components/ServiceCashbackNotice";
import { StatePanel } from "../components/StatePanel";
import { ShareAddressModal } from "./service/ShareAddressModal";
import { useConversationRealtime } from "../hooks/useConversationRealtime";
import { createCustomerCourierRequest, cancelCourierRequest, getCustomerCourierRequests } from "../services/courier.api";
import { finishedServiceStatuses } from "../utils/service-history";
import { mergeConversationSnapshot } from "../utils/live-refresh";
import { useChatTimeline } from "../hooks/useChatTimeline";
import { useChatTyping } from "../hooks/useChatTyping";
import { getGeneratedChargeQr } from "../services/seller.api";
import { completeDeliveryOrderWithCode } from "../services/orders.api";
import {
  acceptServiceConversation,
  acceptServiceProposal,
  cancelServiceConversation,
  confirmServiceCompletion,
  createServiceProposal,
  createServiceReview,
  declineServiceProposal,
  disputeServiceCompletion,
  getServiceConversation,
  markServiceConversationRead,
  markServiceDelivered,
  sendServiceConversationLocation,
  sendServiceConversationMessage,
  setServiceConversationTyping,
} from "../services/service-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { formatarHora } from "../utils/date";
import { formatarDinheiro } from "../utils/money";
import { formatCep } from "../utils/authValidation";
import { addressDirectionsUrl } from "../utils/chat-address";
import { canCancelServiceConversation, serviceProposalHasPlatformPayment } from "../utils/service-closure";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

const initialProposalForm = {
  amount: "",
  description: "",
  paymentMode: "ONLINE",
};

const conversationStatusCopy = {
  ABERTA: "Aguardando aceite",
  ACORDADA: "Em atendimento",
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmacao",
  CANCELADA: "Cancelada",
  ENCERRADA: "Concluida",
};

export function ServiceConversationScreen({ navigation, route }) {
  const { notify } = useFeedback();
  const { session } = useAuthStore();
  const insets = useSafeAreaInsets();
  const initial = route.params?.conversation;
  const scrollRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const reloadPendingRef = useRef(false);
  const [actionLoading, setActionLoading] = useState("");
  const [acceptPaymentMode, setAcceptPaymentMode] = useState("ONLINE");
  const [conversation, setConversation] = useState(initial);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [deliveryCodeInput, setDeliveryCodeInput] = useState("");
  const [error, setError] = useState("");
  const [proposalForm, setProposalForm] = useState(initialProposalForm);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({ comment: "", rating: 0 });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shareAddressOpen, setShareAddressOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [recallRequest, setRecallRequest] = useState(null);
  const [messagePage, setMessagePage] = useState({ hasMore: true, nextCursor: null });
  const timeline = useChatTimeline({
    latestMessageId: conversation?.messages?.at(-1)?.id,
    latestMessageIsMine: conversation?.messages?.at(-1)?.isMine,
    scrollRef,
  });
  const typing = useChatTyping({
    conversationId: conversation?.id,
    draft,
    sendTyping: (isTyping) => setServiceConversationTyping(session?.accessToken, conversation?.id, isTyping),
  });

  const latestProposal = useMemo(
    () => [...(conversation?.proposals ?? [])].reverse()[0] ?? null,
    [conversation?.proposals],
  );
  const canChat = ["ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(
    conversation?.status,
  );
  const canCreateProposal =
    conversation?.isSeller
    && conversation?.status === "ACORDADA"
    && conversation?.serviceType?.mode !== "PRECO_FIXO"
    && !["PAGA", "CONCLUIDA"].includes(latestProposal?.status)
    && !(
      latestProposal?.status === "ACEITA"
      && latestProposal?.charge?.status === "ATIVA"
    );
  const customerHasPendingProposal =
    !conversation?.isSeller
    && conversation?.status === "ACORDADA"
    && latestProposal?.status === "PENDENTE";
  const isFixedPrice = conversation?.serviceType?.mode === "PRECO_FIXO";
  const isCourierRide = Boolean(
    conversation?.request?.store
    || conversation?.courierRide
    || conversation?.serviceType?.operationalType === "ENTREGA_LOCAL",
  );
  const isCustomerMotoboyRide = Boolean(
    (conversation?.courierRide || conversation?.serviceType?.operationalType === "ENTREGA_LOCAL")
    && !conversation?.request?.store
    && !conversation?.request?.order,
  );
  const isAwaitingServiceAcceptance = Boolean(
    !isCourierRide && conversation?.status === "ABERTA",
  );
  const canCancelRide = Boolean(
    isCourierRide
    && canCancelServiceConversation(conversation),
  );
  const canCancelService = !isCourierRide && conversation?.status === "ACORDADA"
    && canCancelServiceConversation(conversation);
  const finished = finishedServiceStatuses.has(conversation?.status);
  const canRecallCourier = finished && isCustomerMotoboyRide && !conversation?.isSeller;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !initial?.id) return;
    if (loadPromiseRef.current) {
      reloadPendingRef.current = true;
      return loadPromiseRef.current;
    }
    if (!silent) setError("");

    const request = (async () => {
      try {
        do {
          reloadPendingRef.current = false;
          const response = await getServiceConversation(session.accessToken, initial.id);
          setConversation((current) => mergeConversationSnapshot(current, response.conversation));
          if (response.conversation.courierRecall) {
            const calls = await getCustomerCourierRequests(session.accessToken, response.conversation.serviceType.id);
            const currentCall = (calls.requests ?? []).find((item) => Number(item.targetedCourier?.userId ?? item.acceptedCourier?.userId) === Number(response.conversation.seller.userId));
            setRecallRequest(currentCall?.status === "PENDENTE" ? currentCall : null);
            if (currentCall?.status === "ACEITA" && currentCall.conversationId) {
              const next = await getServiceConversation(session.accessToken, currentCall.conversationId);
              navigation.replace("ServiceConversation", { conversation: next.conversation });
              return;
            }
          }
          setMessagePage((current) => current.nextCursor ? current : (response.messagePage ?? { hasMore: false, nextCursor: null }));
        } while (reloadPendingRef.current);
      } catch (requestError) {
        if (!silent) {
          setError(requestError.message ?? "Nao foi possivel carregar a conversa.");
        }
      }
    })();
    loadPromiseRef.current = request;

    try {
      return await request;
    } finally {
      if (loadPromiseRef.current === request) loadPromiseRef.current = null;
    }
  }, [initial?.id, navigation, session?.accessToken]);

  const loadOlder = useCallback(async () => {
    if (!session?.accessToken || !conversation?.id || loadingOlder || !messagePage.hasMore || !messagePage.nextCursor) return;
    setLoadingOlder(true);
    try {
      const response = await getServiceConversation(session.accessToken, conversation.id, {
        beforeMessageId: messagePage.nextCursor,
      });
      setConversation((current) => {
        if (!current) return response.conversation;
        const known = new Set((current.messages ?? []).map((item) => Number(item.id)));
        const older = (response.conversation?.messages ?? []).filter((item) => !known.has(Number(item.id)));
        return { ...current, messages: [...older, ...(current.messages ?? [])] };
      });
      setMessagePage(response.messagePage ?? { hasMore: false, nextCursor: null });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar mensagens antigas.");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversation?.id, loadingOlder, messagePage.hasMore, messagePage.nextCursor, session?.accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (latestProposal?.status === "PENDENTE") {
      setAcceptPaymentMode(latestProposal.paymentMode ?? "ONLINE");
    }
  }, [latestProposal?.id, latestProposal?.paymentMode, latestProposal?.status]);

  useEffect(() => {
    const eventName = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(eventName, () => {
      timeline.scrollToLatest(true);
    });

    return () => subscription.remove();
  }, [timeline.scrollToLatest]);

  const refreshConversation = useCallback(() => {
    return load({ silent: true });
  }, [load]);

  useConversationRealtime({
    accessToken: session?.accessToken,
    conversationId: conversation?.id,
    events: [
      realtimeEvents.serviceChatCreated,
      realtimeEvents.serviceChatUpdated,
      realtimeEvents.chargeUpdated,
    ],
    ignoreReasons: ["read"],
    onUpdate: refreshConversation,
  });

  useEffect(() => {
    if (!session?.accessToken || !conversation?.id) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const onMessage = (payload = {}) => {
      if (Number(payload.conversationId) !== Number(conversation.id) || !payload.message) return;
      const message = {
        ...payload.message,
        isMine: Number(payload.senderUserId) === Number(session.user?.id),
      };
      setConversation((current) => {
        if (!current || current.messages?.some((item) => Number(item.id) === Number(message.id))) return current;
        return { ...current, lastMessage: message, messages: [...(current.messages ?? []), message] };
      });
      if (!message.isMine) void markServiceConversationRead(session.accessToken, conversation.id).catch(() => {});
    };
    const onUpdated = (payload = {}) => {
      if (Number(payload.conversationId) !== Number(conversation.id) || payload.reason !== "read") return;
      const readAt = new Date().toISOString();
      setConversation((current) => current
        ? { ...current, messages: (current.messages ?? []).map((item) => item.isMine && !item.readAt ? { ...item, readAt } : item) }
        : current);
    };
    const onTyping = (payload = {}) => {
      if (payload.scope === "service" && Number(payload.senderUserId) !== Number(session.user?.id)) typing.receiveTyping(payload);
    };
    const onOrderStatus = (payload = {}) => {
      if (Number(payload.orderId) !== Number(conversation.request?.order?.id)) return;
      setConversation((current) => current?.request?.order
        ? { ...current, request: { ...current.request, order: { ...current.request.order, status: payload.status } } }
        : current);
    };
    const onCourierUpdate = (payload = {}) => {
      if (canRecallCourier && Number(payload.request?.targetedCourier?.userId) === Number(conversation.seller?.userId)) {
        void load({ silent: true });
      }
    };
    const onAvailability = (payload = {}) => {
      if (canRecallCourier && Number(payload.sellerId) === Number(conversation.seller?.id)) void load({ silent: true });
    };
    socket?.on(realtimeEvents.courierRequestUpdated, onCourierUpdate);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, onAvailability);
    socket?.on(realtimeEvents.serviceChatMessageCreated, onMessage);
    socket?.on(realtimeEvents.orderStatusUpdated, onOrderStatus);
    socket?.on(realtimeEvents.chatTyping, onTyping);
    socket?.on(realtimeEvents.serviceChatUpdated, onUpdated);
    return () => {
      socket?.off(realtimeEvents.courierRequestUpdated, onCourierUpdate);
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, onAvailability);
      socket?.off(realtimeEvents.serviceChatMessageCreated, onMessage);
      socket?.off(realtimeEvents.orderStatusUpdated, onOrderStatus);
      socket?.off(realtimeEvents.chatTyping, onTyping);
      socket?.off(realtimeEvents.serviceChatUpdated, onUpdated);
    };
  }, [conversation?.id, conversation?.request?.order?.id, conversation?.seller?.id, conversation?.seller?.userId, canRecallCourier, load, session?.accessToken, session?.user?.id, typing.receiveTyping]);

  async function callCourierAgain() {
    if (actionLoading || !canRecallCourier || !conversation.courierRecall?.available || recallRequest) return;
    setActionLoading("recall");
    setError("");
    try {
      const result = await createCustomerCourierRequest(session.accessToken, {
        previousConversationId: conversation.id,
        serviceTypeId: conversation.serviceType.id,
        description: "Quero chamar você novamente. Combinamos os detalhes no chat.",
      });
      setRecallRequest(result.request);
      notify("Chamada enviada", `Somente ${conversation.otherPerson.name} receberá este chamado. Aguarde o aceite.`, "success");
      await load({ silent: true });
    } catch (failure) {
      setError(failure.message || "Não foi possível chamar este motoboy.");
      await load({ silent: true });
    } finally { setActionLoading(""); }
  }

  async function cancelRecall() {
    if (actionLoading || !recallRequest) return;
    setActionLoading("cancel-recall");
    try {
      await cancelCourierRequest(session.accessToken, recallRequest.id);
      setRecallRequest(null);
      notify("Chamada cancelada", "O atendimento anterior continua salvo no histórico.", "info");
      await load({ silent: true });
    } catch (failure) { setError(failure.message || "Não foi possível cancelar a chamada."); }
    finally { setActionLoading(""); }
  }

  async function send(payload = null) {
    if ((!draft.trim() && !payload?.attachment) || sending || !session?.accessToken) return;
    setSending(true);
    setError("");

    try {
      const response = await sendServiceConversationMessage(session.accessToken, conversation.id, {
        ...(payload ?? {}),
        message: payload?.message ?? draft,
      });
      setDraft("");
      if (response?.message) {
        setConversation((current) => current?.messages?.some((item) => Number(item.id) === Number(response.message.id))
          ? current
          : { ...current, lastMessage: response.message, messages: [...(current?.messages ?? []), response.message] });
      }
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel enviar.");
      throw requestError;
    } finally {
      setSending(false);
    }
  }

  async function shareAddress(location) {
    await runAction("location", async () => {
      await sendServiceConversationLocation(
        session.accessToken,
        conversation.id,
        location,
      );
      setShareAddressOpen(false);
      await load({ silent: true });
    });
  }

  async function submitProposal() {
    const amountCents = parseMoneyToCents(proposalForm.amount);

    if (!amountCents) {
      setError("Informe um valor valido para a proposta.");
      return;
    }

    await runAction("proposal", async () => {
      const response = await createServiceProposal(
        session.accessToken,
        conversation.id,
        {
          amountCents,
          description: proposalForm.description,
          paymentMode: proposalForm.paymentMode,
        },
      );
      setConversation(response.conversation);
      setProposalForm(initialProposalForm);
      setProposalOpen(false);
    });
  }

  async function acceptProposal(proposal, paymentMode = proposal?.paymentMode) {
    await runAction("accept", async () => {
      const response = await acceptServiceProposal(
        session.accessToken,
        conversation.id,
        proposal.id,
        paymentMode,
      );
      setConversation(response.conversation);

      if (paymentMode === "ONLINE" && response.charge?.code) {
        navigation.navigate("ChargePayment", {
          code: response.charge.code,
          returnToServiceConversation: true,
        });
      }
    });
  }

  async function declineProposal(proposal) {
    await runAction("decline", async () => {
      const response = await declineServiceProposal(
        session.accessToken,
        conversation.id,
        proposal.id,
      );
      setConversation(response.conversation);
    });
  }

  async function openChargePayment(proposal) {
    if (proposal?.charge?.code) {
      navigation.navigate("ChargePayment", {
        code: proposal.charge.code,
        returnToServiceConversation: true,
      });
    }
  }

  async function openChargeQr(proposal) {
    if (!proposal?.charge?.id) return;

    await runAction("qr", async () => {
      if (isCustomerMotoboyRide && conversation.status === "ACORDADA" && proposal.paymentMode === "QR_PRESENCIAL") {
        const finished = await markServiceDelivered(session.accessToken, conversation.id);
        setConversation(finished.conversation);
      }
      const response = await getGeneratedChargeQr(
        session.accessToken,
        proposal.charge.id,
      );
      navigation.navigate("ChargeQr", response);
    });
  }

  async function deliverService() {
    await runAction("delivered", async () => {
      const response = await markServiceDelivered(
        session.accessToken,
        conversation.id,
      );
      setConversation(response.conversation);
    });
  }

  async function acceptCall() {
    await runAction("accept-call", async () => {
      const response = await acceptServiceConversation(
        session.accessToken,
        conversation.id,
      );
      setConversation(response.conversation);
    });
  }

  async function closePendingCall() {
    await runAction("close-pending-call", async () => {
      const response = await cancelServiceConversation(
        session.accessToken,
        conversation.id,
      );
      setConversation(response.conversation);
    });
  }

  async function confirmCompletion() {
    await runAction("completion", async () => {
      const response = await confirmServiceCompletion(
        session.accessToken,
        conversation.id,
      );
      setConversation(response.conversation);
    });
  }

  async function disputeCompletion() {
    await runAction("dispute", async () => {
      const response = await disputeServiceCompletion(session.accessToken, conversation.id);
      setConversation(response.conversation);
    });
  }

  async function confirmStoreDelivery() {
    if (!/^\d{4}$/.test(deliveryCodeInput)) {
      setError("Digite os 4 digitos que o cliente recebeu no pedido.");
      return;
    }
    await runAction("delivery-code", async () => {
      await completeDeliveryOrderWithCode(
        session.accessToken,
        conversation.request.order.id,
        conversation.id,
        deliveryCodeInput,
      );
      setConversation((current) => ({
        ...current,
        request: {
          ...current.request,
          order: { ...current.request.order, status: "CONCLUIDO" },
        },
      }));
      setDeliveryCodeInput("");
    });
  }

  async function submitReview() {
    if (!reviewForm.rating) {
      setError("Escolha de 1 a 5 estrelas para avaliar.");
      return;
    }
    await runAction("review", async () => {
      const response = await createServiceReview(
        session.accessToken,
        conversation.id,
        reviewForm,
      );
      setConversation(response.conversation);
      setReviewOpen(false);
    });
  }

  async function cancelRide() {
    await runAction("cancel-ride", async () => {
      const response = await cancelServiceConversation(
        session.accessToken,
        conversation.id,
      );
      setConversation(response.conversation);
      setCancelOpen(false);
    });
  }

  async function runAction(key, action) {
    if (!session?.accessToken || actionLoading) return;
    setActionLoading(key);
    setError("");

    try {
      await action();
      if (serviceActionFeedback[key]) notify(...serviceActionFeedback[key]);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel concluir esta acao.");
    } finally {
      setActionLoading("");
    }
  }

  if (!conversation) {
    return (
      <ScreenContainer edges={["top", "left", "right"]}>
        <StatePanel icon="chatbubbles-outline" loading text="Abrindo conversa..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      contentContainerStyle={styles.content}
      edges={["top", "left", "right"]}
      padded={false}
      scroll={false}
    >
      <View style={styles.header}>
        <BackHeader compact onPress={navigation.goBack} showTitle={false} />
        <View style={styles.avatar}>
          {conversation.otherPerson?.photoUrl ? (
            <Image
              source={{ uri: resolveMediaUrl(conversation.otherPerson.photoUrl) }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>
              {conversation.otherPerson?.name?.[0]?.toUpperCase() ?? "U"}
            </Text>
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.serviceName}>
            {conversation.serviceType?.name ?? conversation.segment?.name ?? "Servico"}
          </Text>
          <Text numberOfLines={1} style={styles.personName}>
            {conversation.otherPerson?.name ?? "Conversa"}
          </Text>
          <View style={styles.statusLine}>
            <View style={[styles.statusDot, finished && { backgroundColor: colors.textMuted }]} />
            <Text style={styles.statusText}>
              {isCustomerMotoboyRide && conversation.status === "AGUARDANDO_CONFIRMACAO"
                ? "Aguardando pagamento"
                : conversationStatusCopy[conversation.status] ?? conversation.status}
            </Text>
          </View>
        </View>
        {canCreateProposal ? (
          <Pressable
            accessibilityLabel="Propor valor"
            onPress={() => setProposalOpen(true)}
            style={({ pressed }) => [
              styles.proposalShortcut,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.card} name="cash-outline" size={18} />
            <Text style={styles.proposalShortcutText}>Propor</Text>
          </Pressable>
        ) : null}
      </View>

      {canRecallCourier ? (
        <View style={styles.recallCard}>
          <View style={styles.recallHeading}>
            <Ionicons color={colors.primaryDark} name="bicycle-outline" size={20} />
            <Text style={styles.recallTitle}>Chamar este motoboy novamente</Text>
            <View style={[styles.statusDot, { backgroundColor: conversation.courierRecall?.available ? colors.success : colors.textMuted }]} />
          </View>
          <Text style={styles.proposalHint}>
            {recallRequest ? "Chamada enviada só para este profissional. Aguardando o aceite."
              : !conversation.courierRecall ? "Conferindo disponibilidade…"
              : conversation.courierRecall.busy ? "Online · Em outra corrida agora"
              : conversation.courierRecall.available ? "Online · Disponível para receber seu chamado"
              : "Offline · Indisponível para novos chamados agora"}
          </Text>
          <AppButton
            disabled={Boolean(actionLoading) || (!recallRequest && !conversation.courierRecall?.available)}
            icon={recallRequest ? "close-outline" : "radio-outline"}
            loading={actionLoading === "recall" || actionLoading === "cancel-recall"}
            onPress={recallRequest ? cancelRecall : callCourierAgain}
            title={recallRequest ? "Cancelar nova chamada" : "Chamar novamente"}
            variant={recallRequest ? "outline" : "primary"}
          />
        </View>
      ) : null}

      {isCourierRide ? (
        <View style={styles.deliveryContext}>
          <View style={styles.deliveryContextHeader}>
            <View style={styles.deliveryContextIcon}>
              <Ionicons color={colors.primaryDark} name="bicycle-outline" size={19} />
            </View>
            <View style={styles.deliveryContextCopy}>
              <Text style={styles.deliveryContextEyebrow}>
                {conversation.request?.store ? "CORRIDA DA LOJA" : "CORRIDA LOCAL"}
              </Text>
              <Text numberOfLines={1} style={styles.deliveryContextStore}>{conversation.request?.store?.name ?? (finished ? "Atendimento anterior" : "Corrida em atendimento")}</Text>
              {conversation.request.description ? (
                <Text numberOfLines={1} style={styles.deliveryDescription}>
                  {conversation.request.description}
                </Text>
              ) : null}
            </View>
            <View style={styles.deliveryLive}><View style={[styles.deliveryLiveDot, finished && { backgroundColor: colors.textMuted }]} /><Text style={styles.deliveryLiveText}>{conversation.status === "CANCELADA" ? "Cancelada" : finished ? "Finalizada" : "Ativa"}</Text></View>
          </View>
          {conversation.request?.origin || conversation.request?.destination ? (
            <View style={styles.deliveryRouteCompact}>
              <Ionicons color={colors.primaryDark} name="navigate-outline" size={15} />
              <Text numberOfLines={1} style={styles.deliveryRouteText}>
                {[conversation.request.origin, conversation.request.destination].filter(Boolean).join("  →  ")}
              </Text>
            </View>
          ) : null}
          {canCancelRide ? (
            <Pressable
              onPress={() => setCancelOpen(true)}
              style={({ pressed }) => [styles.cancelRideButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.danger} name="close-circle-outline" size={17} />
              <Text style={styles.cancelRideText}>Cancelar corrida</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isAwaitingServiceAcceptance ? (
        <View style={styles.acceptanceCard}>
          <View style={styles.acceptanceIcon}>
            <Ionicons color={colors.primaryDark} name="notifications-outline" size={21} />
          </View>
          <View style={styles.acceptanceCopy}>
            <Text style={styles.acceptanceEyebrow}>CHAMADO AGUARDANDO</Text>
            <Text style={styles.acceptanceTitle}>
              {conversation.isSeller ? "Aceite para iniciar a conversa" : "Aguardando o prestador aceitar"}
            </Text>
            <Text style={styles.acceptanceText}>
              {conversation.isSeller
                ? conversation.request?.description || "Confira o pedido e libere o chat para negociar os detalhes."
                : "Assim que o prestador aceitar, o chat sera liberado em tempo real."}
            </Text>
          </View>
          <View style={styles.acceptanceActions}>
            {conversation.isSeller ? (
              <Pressable
                disabled={Boolean(actionLoading)}
                onPress={acceptCall}
                style={({ pressed }) => [styles.acceptanceButton, pressed && styles.pressed]}
              >
                {actionLoading === "accept-call"
                  ? <ActivityIndicator color={colors.card} />
                  : <><Text style={styles.acceptanceButtonText}>Aceitar</Text><Ionicons color={colors.card} name="arrow-forward" size={17} /></>}
              </Pressable>
            ) : null}
            <Pressable
              disabled={Boolean(actionLoading)}
              onPress={closePendingCall}
              style={({ pressed }) => [styles.acceptanceDismiss, pressed && styles.pressed]}
            >
              {actionLoading === "close-pending-call"
                ? <ActivityIndicator color={colors.danger} />
                : <Text style={styles.acceptanceDismissText}>{conversation.isSeller ? "Recusar" : "Cancelar"}</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorStrip}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setError("")}>
            <Ionicons color={colors.danger} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}

      {conversation.isSeller && conversation.request?.store && conversation.request?.order?.status === "SAIU_ENTREGA" ? (
        <View style={styles.deliveryProofCard}>
          <View style={styles.deliveryProofHeader}>
            <Ionicons color={colors.primaryDark} name="bag-check-outline" size={22} />
            <View style={styles.deliveryProofCopy}>
              <Text style={styles.deliveryProofTitle}>Confirmar entrega do pedido</Text>
              <Text style={styles.deliveryProofHint}>Peça ao cliente o código exibido no pedido. Digite somente após entregar os itens.</Text>
            </View>
          </View>
          <TextInput
            accessibilityLabel="Codigo de entrega de 4 digitos"
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={(value) => setDeliveryCodeInput(value.replace(/\D/g, ""))}
            placeholder="Código de 4 dígitos"
            style={styles.deliveryProofInput}
            value={deliveryCodeInput}
          />
          <AppButton
            disabled={deliveryCodeInput.length !== 4 || Boolean(actionLoading)}
            icon="checkmark-circle-outline"
            loading={actionLoading === "delivery-code"}
            onPress={confirmStoreDelivery}
            title="Confirmar entrega"
          />
        </View>
      ) : null}

      {latestProposal ? (
        <ProposalCard
          actionLoading={actionLoading}
          conversation={conversation}
          isCourierRide={isCourierRide}
          isCustomerMotoboyRide={isCustomerMotoboyRide}
          onAccept={acceptProposal}
          onCancel={canCancelService ? () => setCancelOpen(true) : null}
          onConfirmCompletion={confirmCompletion}
          onDecline={declineProposal}
          onDeliver={deliverService}
          onOpenPayment={openChargePayment}
          onOpenQr={openChargeQr}
          onOpenWallet={() => navigation.navigate("Carteira")}
          proposal={latestProposal}
        />
      ) : (
        <View style={styles.contextStrip}>
          <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={18} />
          <Text style={styles.contextText}>
            {finished ? "Este atendimento está salvo no histórico. Consulte aqui as mensagens e os detalhes."
              : conversation.isSeller || !["ABERTA", "ACORDADA"].includes(conversation.status)
              ? "Combine os detalhes e envie uma proposta quando o valor estiver definido."
              : "Combine o serviço e pague pelo app para ganhar cashback nos serviços elegíveis."}
          </Text>
        </View>
      )}

      {canCancelService && !latestProposal ? (
        <View style={styles.cancelServiceSection}>
          <CancelServiceButton disabled={Boolean(actionLoading)} onPress={() => setCancelOpen(true)} />
        </View>
      ) : null}

      {!conversation.isSeller && conversation.canDispute ? (
        <Pressable accessibilityRole="button" disabled={Boolean(actionLoading)} onPress={disputeCompletion} style={styles.rideDispute}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
          <Text style={styles.rideDisputeText}>Problema com o atendimento? Contestar antes da liberação.</Text>
        </Pressable>
      ) : null}

      {conversation.canReview ? (
        <Pressable
          onPress={() => setReviewOpen(true)}
          style={({ pressed }) => [styles.reviewPrompt, pressed && styles.pressed]}
        >
          <View style={styles.reviewPromptIcon}>
            <Ionicons color={colors.primaryDark} name="star-outline" size={19} />
          </View>
          <View style={styles.reviewPromptCopy}>
            <Text style={styles.reviewPromptTitle}>Como foi este atendimento?</Text>
            <Text style={styles.reviewPromptText}>Sua avaliacao ajuda clientes a escolher melhor.</Text>
          </View>
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={19} />
        </Pressable>
      ) : conversation.review ? (
        <View style={styles.reviewSaved}>
          <Ionicons color={colors.primaryDark} name="star" size={17} />
          <Text style={styles.reviewSavedText}>
            Voce avaliou este atendimento com {conversation.review.rating} estrela{conversation.review.rating === 1 ? "" : "s"}.
          </Text>
        </View>
      ) : null}

      <View style={styles.timeline}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={styles.messages}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={timeline.isAtBottom ? undefined : { minIndexForVisible: 0 }}
          onContentSizeChange={timeline.onContentSizeChange}
          onLayout={timeline.onLayout}
          onScrollBeginDrag={timeline.onScrollBeginDrag}
          onScroll={(event) => {
            timeline.onScroll(event);
            if (event.nativeEvent.contentOffset.y < 60) void loadOlder();
          }}
          ref={scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.messagesScroll}
        >
          {loadingOlder ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          {(conversation.messages ?? []).length ? (
            (conversation.messages ?? []).map((message) => (
              <MessageBubble accessToken={session.accessToken} key={message.id} message={message} />
            ))
          ) : (
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatIcon}>
                <Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={25} />
              </View>
              <Text style={styles.emptyChatTitle}>{finished ? "Histórico do atendimento" : "Comece pelos detalhes"}</Text>
              <Text style={styles.emptyChatText}>
                {finished ? "Este atendimento foi encerrado sem mensagens na conversa." : "Informe local, horario, o que precisa ser feito e envie fotos quando ajudar."}
              </Text>
            </View>
          )}
          <ChatTypingIndicator visible={typing.isOtherTyping} />
        </ScrollView>
        <ChatScrollToLatestButton onPress={timeline.scrollToLatest} unreadCount={timeline.unreadBelow} visible={!timeline.isAtBottom} />
      </View>

      <ChatComposer
        disabled={!canChat}
        draft={draft}
        extraActions={conversation.isSeller ? [] : [{
          hint: "Enviar endereço de retirada, destino ou outro ponto da rota",
          icon: "map-outline",
          label: "Endereço",
          onPress: () => setShareAddressOpen(true),
        }]}
        onChangeDraft={setDraft}
        onAttachmentError={setError}
        onFocus={() => timeline.scrollToLatest(true)}
        onSend={send}
        onSendAttachment={send}
        placeholder={canChat ? "Escreva uma mensagem" : isAwaitingServiceAcceptance ? "Chat aguardando aceite" : "Atendimento encerrado"}
        sending={sending}
        style={{ paddingBottom: Math.max(spacing.sm, insets.bottom + spacing.xs) }}
      />

      <ProposalModal
        form={proposalForm}
        isCourierRide={isCourierRide}
        loading={actionLoading === "proposal"}
        onChange={setProposalForm}
        onClose={() => setProposalOpen(false)}
        onSubmit={submitProposal}
        open={proposalOpen}
      />
      <ReviewModal
        form={reviewForm}
        loading={actionLoading === "review"}
        onChange={setReviewForm}
        onClose={() => setReviewOpen(false)}
        onSubmit={submitReview}
        open={reviewOpen}
      />
      <ProposalDecisionModal
        error={error}
        isCourierRide={isCourierRide}
        isFixedPrice={isFixedPrice}
        loading={actionLoading === "accept" || actionLoading === "decline"}
        onAccept={() => acceptProposal(latestProposal, acceptPaymentMode)}
        onDecline={() => declineProposal(latestProposal)}
        onPaymentModeChange={setAcceptPaymentMode}
        open={customerHasPendingProposal}
        paymentMode={acceptPaymentMode}
        proposal={latestProposal}
      />
      <CancelRideModal
        isCourierRide={isCourierRide}
        loading={actionLoading === "cancel-ride"}
        onCancel={cancelRide}
        onClose={() => setCancelOpen(false)}
        open={cancelOpen}
      />
      <ShareAddressModal
        loading={actionLoading === "location"}
        onClose={() => setShareAddressOpen(false)}
        onSubmit={shareAddress}
        open={shareAddressOpen}
      />
    </ScreenContainer>
  );
}

function MessageBubble({ accessToken, message }) {
  if (message.author === "system") {
    return (
      <View style={styles.systemMessage}>
        <Ionicons color={colors.primaryDark} name="information-circle-outline" size={16} />
        <Text style={styles.systemText}>{message.text}</Text>
        <Text style={styles.systemTime}>{formatarHora(message.createdAt)}</Text>
      </View>
    );
  }

  if (message.location) {
    return <LocationMessageCard message={message} />;
  }

  return (
    <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
      <View style={[styles.bubble, message.isMine && styles.mine]}>
        <ChatAttachment accessToken={accessToken} attachment={message.attachment} isMine={message.isMine} />
        {message.imageUrl && !message.attachment ? (
          <Image
            source={{ uri: resolveMediaUrl(message.imageUrl) }}
            style={styles.messageImage}
          />
        ) : null}
        {message.text ? (
          <Text style={[styles.messageText, message.isMine && styles.mineText]}>
            {message.text}
          </Text>
        ) : null}
        <ChatMessageMeta createdAt={message.createdAt} isMine={message.isMine} readAt={message.readAt} />
      </View>
    </View>
  );
}

function LocationMessageCard({ message }) {
  const location = message.location;
  async function openDirections() {
    try { await Linking.openURL(addressDirectionsUrl(location)); }
    catch { Alert.alert("Não foi possível abrir o mapa", "Tente novamente com uma conexão disponível."); }
  }
  const label = location.label === "DESTINO"
    ? "Destino"
    : location.label === "OUTRO"
      ? "Local compartilhado"
      : "Local de retirada";

  return (
    <View style={[styles.messageLine, message.isMine && styles.messageLineMine]}>
      <View style={[styles.locationCard, message.isMine && styles.locationCardMine]}>
        <View style={styles.locationTopline}>
          <View style={[styles.locationIcon, message.isMine && styles.locationIconMine]}>
            <Ionicons
              color={message.isMine ? colors.card : colors.primaryDark}
              name="location"
              size={18}
            />
          </View>
          <View style={styles.locationCopy}>
            <Text style={[styles.locationLabel, message.isMine && styles.locationTextMine]}>{label}</Text>
          </View>
        </View>
        <Text selectable style={[styles.locationAddress, message.isMine && styles.locationTextMine]}>
          {[location.street, location.number].filter(Boolean).join(", ")}
        </Text>
        <Text style={[styles.locationDetail, message.isMine && styles.locationDetailMine]}>
          {location.district} - {location.city}/{location.state}
        </Text>
        <Text style={[styles.locationDetail, message.isMine && styles.locationDetailMine]}>
          CEP {formatCep(location.zipCode)}
        </Text>
        {location.complement ? (
          <Text style={[styles.locationDetail, message.isMine && styles.locationDetailMine]}>
            Complemento: {location.complement}
          </Text>
        ) : null}
        {location.reference ? (
          <Text style={[styles.locationReference, message.isMine && styles.locationTextMine]}>
            Referencia: {location.reference}
          </Text>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Abrir rota para ${location.street}, ${location.number}`}
          onPress={openDirections} style={({ pressed }) => [styles.locationMapButton, message.isMine && styles.locationMapButtonMine, pressed && { opacity: 0.75 }]}>
          <Ionicons color={message.isMine ? colors.card : colors.primaryDark} name="navigate-outline" size={19} />
          <Text style={[styles.locationMapText, message.isMine && styles.locationTextMine]}>Abrir rota no mapa</Text>
          <Ionicons color={message.isMine ? colors.card : colors.primaryDark} name="open-outline" size={16} />
        </Pressable>
        <ChatMessageMeta createdAt={message.createdAt} isMine={message.isMine} readAt={message.readAt} />
      </View>
    </View>
  );
}

function CancelServiceButton({ disabled, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.cancelServiceButton, pressed && styles.cancelServicePressed, disabled && styles.cancelServiceDisabled]}
    >
      <Ionicons color="#BE123C" name="close-circle-outline" size={17} />
      <Text style={styles.cancelServiceText}>Cancelar atendimento</Text>
    </Pressable>
  );
}

function ProposalCard({
  actionLoading,
  conversation,
  isCourierRide,
  isCustomerMotoboyRide,
  onAccept,
  onCancel,
  onConfirmCompletion,
  onDecline,
  onDeliver,
  onOpenPayment,
  onOpenQr,
  onOpenWallet,
  proposal,
}) {
  const isSeller = conversation.isSeller;
  const chargeStatus = proposal.charge?.status;
  const paid = serviceProposalHasPlatformPayment(proposal)
    && (proposal.status === "PAGA" || proposal.status === "CONCLUIDA" || chargeStatus === "PAGA");
  const completedOutsideApp = Boolean(proposal.completedOutsideApp);
  const completed = paid || completedOutsideApp;
  const pending = proposal.status === "PENDENTE";
  const activeCharge = proposal.status === "ACEITA" && chargeStatus === "ATIVA";
  const expired = chargeStatus === "EXPIRADA";

  return (
    <View style={[styles.proposalCard, completed && styles.proposalCardPaid]}>
      <View style={styles.proposalTopline}>
        <View style={[styles.proposalIcon, completed && styles.proposalIconPaid]}>
          <Ionicons
            color={completed ? colors.card : colors.primaryDark}
            name={completed ? "checkmark" : "receipt-outline"}
            size={20}
          />
        </View>
        <View style={styles.proposalCopy}>
          <Text style={styles.proposalLabel}>{proposalStatusLabel(proposal, conversation.status)}</Text>
          <Text style={styles.proposalAmount}>{formatarDinheiro(proposal.amountCents)}</Text>
        </View>
        <View style={styles.paymentPill}>
          <Ionicons
            color={colors.primaryDark}
            name={completedOutsideApp ? "cash-outline" : proposal.paymentMode === "ONLINE" ? "phone-portrait-outline" : "qr-code-outline"}
            size={14}
          />
          <Text style={styles.paymentPillText}>
            {completedOutsideApp ? "Fora do app" : proposal.paymentMode === "ONLINE" ? "Online" : "QR presencial"}
          </Text>
        </View>
      </View>

      {proposal.description ? (
        <Text numberOfLines={2} style={styles.proposalDescription}>
          {proposal.description}
        </Text>
      ) : null}

      {completedOutsideApp ? <Text style={styles.proposalHint}>O prestador informou que recebeu fora do app. Atendimento concluido, sem pool, cashback ou ganhos da rede.</Text> : null}

      <ServiceFundsNotice funds={proposal.funds} isSeller={isSeller} onOpenWallet={onOpenWallet} />

      {pending && !isSeller && conversation.status === "ACORDADA" ? (
        <View style={styles.proposalActions}>
          <AppButton
            loading={actionLoading === "accept"}
            onPress={() => onAccept(proposal)}
            style={[styles.proposalAction, styles.compactProposalButton]}
            title="Aceitar proposta"
          />
          <AppButton
            disabled={Boolean(actionLoading)}
            onPress={() => onDecline(proposal)}
            style={[styles.proposalAction, styles.compactProposalButton]}
            title={conversation.serviceType?.mode === "PRECO_FIXO" ? "Cancelar" : "Recusar"}
            variant="outline"
          />
        </View>
      ) : null}

      {pending && isSeller ? (
        <Text style={styles.proposalHint}>{conversation.status === "ABERTA" ? "Aceite o chamado para liberar este valor ao cliente." : "Aguardando o cliente aceitar o valor."}</Text>
      ) : null}

      {pending && !isSeller && conversation.status === "ABERTA" ? (
        <Text style={styles.proposalHint}>O preco esta reservado. Aguarde o prestador aceitar o chamado para escolher o pagamento.</Text>
      ) : null}

      {activeCharge && !isSeller && proposal.paymentMode === "ONLINE" ? (
        <AppButton
          icon="wallet-outline"
          onPress={() => onOpenPayment(proposal)}
          style={styles.compactProposalButton}
          title="Pagar pela plataforma"
        />
      ) : null}

      {activeCharge && !isSeller ? <ServiceCashbackNotice /> : null}

      {activeCharge && isSeller && proposal.paymentMode === "QR_PRESENCIAL" ? (
        <AppButton
          icon="qr-code-outline"
          loading={actionLoading === "qr"}
          onPress={() => onOpenQr(proposal)}
          style={[styles.compactProposalButton, styles.qrProposalButton]}
          title={isCustomerMotoboyRide && conversation.status === "ACORDADA" ? "Cobrar na chegada" : "Exibir QR presencial"}
        />
      ) : null}

      {activeCharge && !isSeller && proposal.paymentMode === "QR_PRESENCIAL" ? (
        <Text style={styles.proposalHint}>
          {isCustomerMotoboyRide && conversation.status === "AGUARDANDO_CONFIRMACAO"
            ? "Corrida finalizada. Pague pelo QR do motoboy para concluir automaticamente."
            : "Encontre o prestador e pague pelo QR que ele exibir no atendimento."}
        </Text>
      ) : null}

      {activeCharge && isSeller && proposal.paymentMode === "ONLINE" ? (
        <Text style={styles.proposalHint}>Aguardando o pagamento online do cliente.</Text>
      ) : null}

      {expired ? (
        <Text style={styles.proposalWarning}>
          A cobranca expirou. Envie uma nova proposta para gerar outro pagamento.
        </Text>
      ) : null}

      {paid && isSeller && (conversation.status === "ACORDADA"
        || (isCustomerMotoboyRide && conversation.status === "AGUARDANDO_CONFIRMACAO")) ? (
        <AppButton
          icon="checkmark-done-outline"
          loading={actionLoading === "delivered"}
          onPress={onDeliver}
          style={styles.compactProposalButton}
          title={isCourierRide ? "Finalizar corrida" : "Servico prestado"}
        />
      ) : null}

      {conversation.status === "AGUARDANDO_CONFIRMACAO" && !isSeller && paid && !isCustomerMotoboyRide ? (
        <AppButton
          icon="shield-checkmark-outline"
          loading={actionLoading === "completion"}
          onPress={onConfirmCompletion}
          style={styles.compactProposalButton}
          title={isCourierRide ? "Confirmar entrega" : "Confirmar servico recebido"}
        />
      ) : null}

      {conversation.status === "AGUARDANDO_CONFIRMACAO" && isSeller && !paid ? (
        <Text style={styles.proposalHint}>
          {isCustomerMotoboyRide && !paid
            ? "Corrida finalizada. Exiba o QR e aguarde o pagamento para concluir."
            : "Aguardando a confirmacao do cliente."}
        </Text>
      ) : null}
      {onCancel ? <CancelServiceButton disabled={Boolean(actionLoading)} onPress={onCancel} /> : null}
    </View>
  );
}

function ServiceFundsNotice({ funds, isSeller, onOpenWallet }) {
  const copy = serviceFundsCopy(funds, isSeller);
  if (!copy) return null;
  const deadline = funds.availableAt && funds.state === "PENDING_RELEASE"
    ? new Date(funds.availableAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <View style={styles.fundsNotice}>
      <Text style={styles.fundsTitle}>{copy.title}</Text>
      {isSeller && funds.netCents != null ? (
        <Text style={styles.proposalHint}>Seu líquido: {formatarDinheiro(funds.netCents)} · Taxas: {formatarDinheiro(funds.feeCents)}</Text>
      ) : null}
      <Text style={styles.proposalHint}>{copy.text}</Text>
      {deadline ? <Text style={styles.fundsTitle}>Liberação prevista: {deadline}</Text> : null}
      {isSeller ? <Pressable accessibilityRole="button" onPress={onOpenWallet} style={styles.fundsWallet}>
        <Text style={styles.fundsTitle}>Ver minha carteira</Text>
        <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
      </Pressable> : null}
    </View>
  );
}

function ProposalModal({ form, isCourierRide, loading, onChange, onClose, onSubmit, open }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.proposalModalCard}>
          <ScrollView
            contentContainerStyle={styles.proposalModalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIcon}>
                <Ionicons color={colors.primaryDark} name="cash-outline" size={22} />
              </View>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>Proposta do servico</Text>
                <Text style={styles.modalTitle}>Combine o valor com seguranca.</Text>
              </View>
              <Pressable onPress={onClose} style={styles.modalClose}>
                <Ionicons color={colors.textPrimary} name="close" size={21} />
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Valor combinado</Text>
              <View style={styles.amountInputShell}>
                <Text style={styles.amountPrefix}>R$</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(amount) => onChange((current) => ({ ...current, amount }))}
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                  style={styles.amountInput}
                  value={form.amount}
                />
              </View>
              {isCourierRide ? (
                <Text style={styles.proposalHint}>
                  O valor recebido pelo entregador fica pendente por 24 horas antes do saque.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Como sera pago</Text>
              <View style={styles.paymentOptions}>
                <PaymentOption
                  active={form.paymentMode === "ONLINE"}
                  icon="phone-portrait-outline"
                  label="Pela plataforma"
                  onPress={() => onChange((current) => ({ ...current, paymentMode: "ONLINE" }))}
                  text="Cliente paga pelo saldo no app"
                />
                <PaymentOption
                  active={form.paymentMode === "QR_PRESENCIAL"}
                  icon="qr-code-outline"
                  label="QR presencial"
                  onPress={() => onChange((current) => ({ ...current, paymentMode: "QR_PRESENCIAL" }))}
                  text="Exiba o QR quando se encontrarem"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Resumo do combinado</Text>
              <TextInput
                multiline
                onChangeText={(description) => onChange((current) => ({ ...current, description }))}
                placeholder="Ex.: frete do Centro ao Bairro, incluindo carga e descarga"
                placeholderTextColor={colors.textMuted}
                style={styles.descriptionInput}
                value={form.description}
              />
            </View>

            <View style={styles.modalActions}>
              <AppButton
                disabled={loading}
                onPress={onClose}
                style={styles.modalAction}
                title="Cancelar"
                variant="neutral"
              />
              <AppButton
                icon="send-outline"
                loading={loading}
                onPress={onSubmit}
                style={styles.modalAction}
                title="Enviar proposta"
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReviewModal({ form, loading, onChange, onClose, onSubmit, open }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons color={colors.primaryDark} name="star-outline" size={22} />
            </View>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalEyebrow}>Avaliacao do atendimento</Text>
              <Text style={styles.modalTitle}>Conte como foi sua experiencia.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={21} />
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Sua nota</Text>
            <View style={styles.ratingChoices}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <Pressable
                  accessibilityLabel={`${rating} estrelas`}
                  key={rating}
                  onPress={() => onChange((current) => ({ ...current, rating }))}
                  style={styles.ratingChoice}
                >
                  <Ionicons
                    color={rating <= form.rating ? "#F59E0B" : colors.borderStrong}
                    name={rating <= form.rating ? "star" : "star-outline"}
                    size={31}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Comentario opcional</Text>
            <TextInput
              multiline
              onChangeText={(comment) => onChange((current) => ({ ...current, comment }))}
              placeholder="O que voce achou do atendimento?"
              placeholderTextColor={colors.textMuted}
              style={styles.descriptionInput}
              value={form.comment}
            />
          </View>

          <View style={styles.modalActions}>
            <AppButton disabled={loading} onPress={onClose} style={styles.modalAction} title="Agora nao" variant="neutral" />
            <AppButton icon="star-outline" loading={loading} onPress={onSubmit} style={styles.modalAction} title="Enviar avaliacao" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CancelRideModal({ isCourierRide, loading, onCancel, onClose, open }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.cancelModalCard}>
          <View style={styles.cancelModalIcon}>
            <Ionicons color={colors.danger} name="close-circle-outline" size={27} />
          </View>
          <Text style={styles.cancelModalTitle}>{isCourierRide ? "Cancelar esta corrida?" : "Cancelar este atendimento?"}</Text>
          <Text style={styles.cancelModalText}>
            A conversa sera encerrada e qualquer cobranca ainda nao paga sera cancelada. Pagamentos confirmados nunca sao cancelados por esta acao.
          </Text>
          <AppButton
            loading={loading}
            onPress={onCancel}
            title="Confirmar cancelamento"
            variant="danger"
          />
          <AppButton
            disabled={loading}
            onPress={onClose}
            title={isCourierRide ? "Continuar corrida" : "Continuar atendimento"}
            variant="outline"
          />
        </View>
      </View>
    </Modal>
  );
}

function ProposalDecisionModal({
  error,
  isCourierRide,
  isFixedPrice,
  loading,
  onAccept,
  onDecline,
  onPaymentModeChange,
  open,
  paymentMode,
  proposal,
}) {
  if (!proposal) return null;

  const isOnline = paymentMode === "ONLINE";

  return (
    <Modal animationType="fade" onRequestClose={() => {}} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <ScrollView contentContainerStyle={styles.decisionModalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.decisionModalCard}>
          <View style={styles.decisionIcon}>
            <Ionicons color={colors.card} name="receipt-outline" size={25} />
          </View>
          <Text style={styles.decisionEyebrow}>{isFixedPrice ? "PRECO FIXO CONFIRMADO" : "Nova proposta recebida"}</Text>
          <Text style={styles.decisionTitle}>{isFixedPrice ? "Escolha como pagar" : "Confirme o combinado"}</Text>
          <Text style={styles.decisionText}>
            Revise o valor e a forma de pagamento antes de aceitar.
          </Text>

          <View style={styles.decisionAmountCard}>
            <Text style={styles.decisionAmountLabel}>Valor do servico</Text>
            <Text style={styles.decisionAmount}>{formatarDinheiro(proposal.amountCents)}</Text>
            {proposal.description ? (
              <Text style={styles.decisionDescription}>{proposal.description}</Text>
            ) : null}
          </View>

          <Text style={styles.fieldLabel}>Escolha como deseja pagar</Text>
          <View style={styles.paymentOptions}>
            <PaymentOption
              active={isOnline}
              icon="wallet-outline"
              label="Pelo aplicativo"
              onPress={() => onPaymentModeChange("ONLINE")}
              text="Pague com a carteira ou Pix"
            />
            <PaymentOption
              active={!isOnline}
              icon="qr-code-outline"
              label="QR presencial"
              onPress={() => onPaymentModeChange("QR_PRESENCIAL")}
              text="Leia o QR do prestador pelo app"
            />
          </View>

          <ServiceCashbackNotice />

          {isCourierRide ? (
            <Text style={styles.decisionText}>
              Por seguranca, o valor do entregador fica pendente por 24 horas antes de poder ser sacado.
            </Text>
          ) : null}

          {error ? <Text style={styles.decisionError}>{error}</Text> : null}

          <AppButton
            icon={isOnline ? "wallet-outline" : "checkmark-circle-outline"}
            loading={loading}
            onPress={onAccept}
            title={isOnline ? "Aceitar e pagar" : "Aceitar proposta"}
          />
          <AppButton
            disabled={loading}
            onPress={onDecline}
            title={isFixedPrice ? "Cancelar este atendimento" : "Recusar e continuar negociando"}
            variant="outline"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PaymentOption({ active, icon, label, onPress, text }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      aria-checked={active}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentOption,
        active && styles.paymentOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.paymentOptionIcon, active && styles.paymentOptionIconActive]}>
        <Ionicons color={colors.primaryDark} name={icon} size={20} />
      </View>
      <Text style={styles.paymentOptionLabel}>{label}</Text>
      <Text style={styles.paymentOptionText}>{text}</Text>
      <View style={styles.paymentOptionCheck}>
        {active ? <Ionicons color={colors.primaryDark} name="checkmark-circle" size={18} /> : null}
      </View>
    </Pressable>
  );
}

function proposalStatusLabel(proposal, conversationStatus) {
  if (proposal.completedOutsideApp) return "Concluido · recebido fora do app";
  if (proposal.status === "CONCLUIDA") return "Servico concluido";
  if (proposal.status === "PAGA" || proposal.charge?.status === "PAGA") return "Pagamento confirmado";
  if (proposal.status === "RECUSADA") return "Proposta recusada";
  if (proposal.status === "CANCELADA") return conversationStatus === "CANCELADA" ? "Proposta cancelada" : "Proposta substituida";
  if (proposal.charge?.status === "EXPIRADA") return "Cobranca expirada";
  if (proposal.status === "ACEITA") return "Proposta aceita";
  return "Nova proposta";
}

function parseMoneyToCents(value) {
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

const styles = StyleSheet.create({
  recallCard: { backgroundColor: colors.primarySoft, borderColor: colors.border, borderWidth: 1,
    padding: spacing.md, gap: spacing.sm },
  recallHeading: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  recallTitle: { flex: 1, color: colors.primaryDark, fontFamily: fonts.semiBold, fontSize: 13 },
  deliveryProofCard: { backgroundColor: "#F0FDF4", borderBottomColor: colors.primaryLight, borderBottomWidth: 1, gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  deliveryProofCopy: { flex: 1, gap: 3 },
  deliveryProofHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  deliveryProofHint: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  deliveryProofInput: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label, letterSpacing: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  deliveryProofTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  acceptanceButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.md, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 40, minWidth: 88, paddingHorizontal: spacing.md },
  acceptanceButtonText: { color: colors.card, fontFamily: fonts.bold, fontSize: typography.caption },
  acceptanceActions: { alignItems: "stretch", gap: spacing.xs },
  acceptanceCard: { alignItems: "center", backgroundColor: colors.warningSoft, borderBottomColor: "#FED7AA", borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  acceptanceCopy: { flex: 1, gap: 2, minWidth: 0 },
  acceptanceDismiss: { alignItems: "center", justifyContent: "center", minHeight: 30, paddingHorizontal: spacing.sm },
  acceptanceDismissText: { color: colors.danger, fontFamily: fonts.bold, fontSize: 10 },
  acceptanceEyebrow: { color: "#B45309", fontFamily: fonts.extraBold, fontSize: 9 },
  acceptanceIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  acceptanceText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  acceptanceTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  amountInput: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: 24, minHeight: 54 },
  amountInputShell: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md },
  amountPrefix: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", overflow: "hidden", width: 42 },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  bubble: { backgroundColor: colors.cardMuted, borderBottomLeftRadius: 5, borderRadius: 18, gap: 5, maxWidth: "84%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelModalCard: { alignItems: "stretch", backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.md, maxWidth: 420, padding: spacing.xl, width: "92%", ...shadowSoft },
  cancelModalIcon: { alignItems: "center", alignSelf: "center", backgroundColor: "#FFF1F2", borderRadius: radius.round, height: 56, justifyContent: "center", width: 56 },
  cancelModalText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  cancelModalTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, textAlign: "center" },
  cancelRideButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFF1F2", borderColor: "#FECDD3", borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 34, paddingHorizontal: spacing.sm },
  cancelRideText: { color: colors.danger, fontFamily: fonts.bold, fontSize: 10 },
  cancelServiceSection: { backgroundColor: "#F2FBF7", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  cancelServiceButton: { alignItems: "center", alignSelf: "stretch", backgroundColor: colors.card, borderColor: "#FECDD3", borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelServiceText: { color: "#BE123C", fontFamily: fonts.semiBold, fontSize: typography.small, textAlign: "center", flexShrink: 1 },
  cancelServicePressed: { backgroundColor: colors.dangerSoft },
  cancelServiceDisabled: { opacity: 0.5 },
  composer: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  composerActions: { alignItems: "center", flexDirection: "row" },
  content: { backgroundColor: colors.background, flex: 1 },
  contextStrip: { alignItems: "center", backgroundColor: colors.primarySoft, borderBottomColor: colors.primaryLight, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 7 },
  contextText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 17 },
  deliveryContext: { backgroundColor: "#FAFFFC", borderBottomColor: colors.border, borderBottomWidth: 1, gap: 7, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  deliveryContextCopy: { flex: 1, gap: 2, minWidth: 0 },
  deliveryContextEyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9, fontWeight: "700" },
  deliveryContextHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  deliveryContextIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 34, justifyContent: "center", width: 34 },
  deliveryContextStore: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.caption },
  deliveryDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 14 },
  deliveryLive: { alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 4 },
  deliveryLiveDot: { backgroundColor: colors.warning, borderRadius: radius.round, height: 6, width: 6 },
  deliveryLiveText: { color: "#92400E", fontFamily: fonts.bold, fontSize: 9 },
  deliveryRouteCompact: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 29, paddingHorizontal: spacing.sm },
  deliveryRouteText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: 10 },
  decisionAmount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 30, fontWeight: "800" },
  decisionAmountCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
  decisionAmountLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  decisionDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18, textAlign: "center" },
  decisionError: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption, textAlign: "center" },
  decisionEyebrow: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 10, textAlign: "center", textTransform: "uppercase" },
  decisionIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 54, justifyContent: "center", width: 54 },
  decisionModalCard: { backgroundColor: colors.card, borderRadius: 24, flexGrow: 0, maxHeight: "95%", maxWidth: 420, width: "92%", ...shadowSoft },
  decisionModalContent: { gap: spacing.md, padding: spacing.xl },
  decisionPaymentCard: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  decisionPaymentCopy: { flex: 1, gap: 2 },
  decisionPaymentIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  decisionPaymentLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  decisionPaymentText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  decisionText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  decisionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, textAlign: "center" },
  descriptionInput: { backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: typography.small, minHeight: 92, padding: spacing.md, textAlignVertical: "top" },
  emptyChat: { alignItems: "center", alignSelf: "center", gap: spacing.sm, maxWidth: 310, paddingVertical: spacing.xxxl },
  emptyChatIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 54, justifyContent: "center", width: 54 },
  emptyChatText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18, textAlign: "center" },
  emptyChatTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  errorStrip: { alignItems: "center", backgroundColor: "#FFF1F2", borderBottomColor: "#FECDD3", borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  errorText: { color: colors.danger, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  header: { alignItems: "center", backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  imageReady: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.xs, padding: spacing.sm },
  imageReadyText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.bold, fontSize: typography.caption },
  input: { color: colors.textPrimary, flex: 1, fontFamily: fonts.regular, fontSize: typography.small, maxHeight: 92, minHeight: 40, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  inputRow: { alignItems: "flex-end", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  locationAddress: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.body, lineHeight: 23, flexShrink: 1 },
  locationCard: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, width: "88%", maxWidth: 360, padding: spacing.lg },
  locationCardMine: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  locationCopy: { flex: 1, gap: 2, minWidth: 0 },
  locationDetail: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  locationDetailMine: { color: "#D5F4E7" },
  locationIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  locationIconMine: { backgroundColor: "rgba(255,255,255,0.16)" },
  locationLabel: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9, textTransform: "uppercase" },
  locationReference: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: typography.caption, marginTop: 3 },
  locationTextMine: { color: colors.card },
  locationTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  locationMapButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  locationMapButtonMine: { backgroundColor: "rgba(255,255,255,0.16)" },
  locationMapText: { flex: 1, color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  messageImage: { borderRadius: radius.md, height: 190, maxWidth: "100%", width: 240 },
  messageLine: { alignItems: "flex-start" },
  messageLineMine: { alignItems: "flex-end" },
  messageText: { color: colors.textPrimary, fontFamily: fonts.regular, fontSize: typography.body, lineHeight: 21 },
  messageTime: { alignSelf: "flex-end", color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 },
  messages: { flexGrow: 1, gap: spacing.sm, justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  messagesScroll: { flex: 1 },
  timeline: { flex: 1, position: "relative" },
  mine: { backgroundColor: colors.primaryDark, borderBottomLeftRadius: 18, borderBottomRightRadius: 5 },
  mineText: { color: colors.card },
  mineTime: { color: "#BDE5D6" },
  modalAction: { flex: 1 },
  modalActions: { flexDirection: "row", gap: spacing.sm },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.lg, maxWidth: 520, padding: spacing.lg, width: "92%", ...shadowSoft },
  fundsNotice: { backgroundColor: colors.card, borderRadius: radius.md, gap: 5, padding: spacing.sm },
  fundsTitle: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 12 },
  fundsWallet: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 44 },
  proposalModalCard: { backgroundColor: colors.card, borderRadius: radius.lg, flexShrink: 1, maxHeight: "100%", maxWidth: 520, overflow: "hidden", width: "100%", ...shadowSoft },
  proposalModalContent: { gap: spacing.lg, padding: spacing.lg },
  modalClose: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  modalEyebrow: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 10, textTransform: "uppercase" },
  modalHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  modalHeaderCopy: { flex: 1, gap: 3, minWidth: 0 },
  modalHeaderIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  modalOverlay: { alignItems: "center", backgroundColor: "rgba(8, 24, 18, 0.48)", flex: 1, justifyContent: "center", padding: spacing.lg },
  modalTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  paymentOption: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flex: 1, gap: 5, minHeight: 125, padding: spacing.md },
  paymentOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  paymentOptionIcon: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  paymentOptionIconActive: { backgroundColor: colors.card },
  paymentOptionLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption, textAlign: "center" },
  paymentOptionText: { color: colors.textSecondary, flexShrink: 0, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, textAlign: "center" },
  paymentOptionCheck: { height: 18, marginTop: "auto" },
  paymentOptions: { flexDirection: "row", gap: spacing.sm },
  paymentPill: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  paymentPillText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
  personName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  photo: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  proposalAction: { flex: 1 },
  proposalActions: { flexDirection: "row", gap: spacing.sm },
  compactProposalButton: { minHeight: 40 },
  qrProposalButton: { minHeight: 44 },
  proposalAmount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label },
  proposalCard: { backgroundColor: "#F2FBF7", borderBottomColor: colors.primaryLight, borderBottomWidth: 1, gap: 7, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  proposalCardPaid: { backgroundColor: "#ECFDF5" },
  proposalCopy: { flex: 1, gap: 2, minWidth: 0 },
  proposalDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  proposalHint: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 17 },
  proposalIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  proposalIconPaid: { backgroundColor: colors.primaryDark },
  proposalLabel: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10, textTransform: "uppercase" },
  proposalShortcut: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.md, flexDirection: "row", gap: 4, height: 36, justifyContent: "center", paddingHorizontal: 10 },
  proposalShortcutText: { color: colors.card, fontFamily: fonts.bold, fontSize: 10 },
  proposalTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  proposalWarning: { color: colors.danger, fontFamily: fonts.bold, fontSize: 11 },
  ratingChoice: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  ratingChoices: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "space-between" },
  reviewPrompt: { alignItems: "center", backgroundColor: "#FFF9E9", borderBottomColor: "#FDE68A", borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  reviewPromptCopy: { flex: 1, gap: 2, minWidth: 0 },
  reviewPromptIcon: { alignItems: "center", backgroundColor: "#FEF3C7", borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  reviewPromptText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  reviewPromptTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  reviewSaved: { alignItems: "center", backgroundColor: colors.primarySoft, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  reviewSavedText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption },
  rideDispute: { alignItems: "center", backgroundColor: colors.dangerSoft, borderBottomColor: colors.danger, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rideDisputeText: { color: colors.danger, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption },
  routeAddressAction: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 4, height: 40, justifyContent: "center", paddingHorizontal: spacing.sm },
  routeAddressActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  routeAddressActionTextDisabled: { color: colors.textMuted },
  send: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, height: 40, justifyContent: "center", width: 40 },
  sendDisabled: { backgroundColor: colors.textMuted },
  serviceName: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 10, textTransform: "uppercase" },
  statusDot: { backgroundColor: colors.success, borderRadius: radius.round, height: 6, width: 6 },
  statusLine: { alignItems: "center", flexDirection: "row", gap: 4 },
  statusText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  systemMessage: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 5, maxWidth: "92%", paddingHorizontal: spacing.md, paddingVertical: 7 },
  systemText: { color: colors.primaryDark, flexShrink: 1, fontFamily: fonts.medium, fontSize: 10, textAlign: "center" },
  systemTime: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 },
});
