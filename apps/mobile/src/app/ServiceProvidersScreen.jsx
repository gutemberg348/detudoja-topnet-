import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  cancelCourierRequest,
  createCustomerCourierRequest,
  getCustomerCourierRequests,
} from "../services/courier.api";
import {
  createServiceConversation,
  getOnlineServiceProviders,
  getServiceConversation,
  getServiceConversations,
} from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function ServiceProvidersScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const segment = route.params?.serviceType ?? route.params?.segment;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [activeCourierConversation, setActiveCourierConversation] = useState(null);
  const [courierAvailable, setCourierAvailable] = useState(false);
  const [courierRequest, setCourierRequest] = useState(null);
  const [sellers, setSellers] = useState([]);
  const isCourier = segment?.operationalType === "ENTREGA_LOCAL";

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !segment?.id) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const [providersResponse, requestsResponse, conversationsResponse] = await Promise.all([
        getOnlineServiceProviders(session.accessToken, segment.id),
        isCourier ? getCustomerCourierRequests(session.accessToken, segment.id) : Promise.resolve({ requests: [] }),
        isCourier ? getServiceConversations(session.accessToken) : Promise.resolve({ conversations: [] }),
      ]);
      const activeConversation = (conversationsResponse.conversations ?? []).find((conversation) => (
        !conversation.isSeller
        && Number(conversation.serviceType?.id) === Number(segment.id)
        && ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)
      ));
      setActiveCourierConversation(activeConversation ?? null);
      setCourierAvailable(Boolean(providersResponse.serviceType?.availableNow));
      setCourierRequest(requestsResponse.requests?.[0] ?? null);
      setSellers(isCourier ? [] : providersResponse.sellers ?? []);
    }
    catch (requestError) { if (!silent) setError(requestError.message ?? "Nao foi possivel buscar prestadores."); }
    finally { if (!silent) setLoading(false); }
  }, [isCourier, segment?.id, session?.accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshProviders = (payload = {}) => {
      if (Number(payload.serviceTypeId) === Number(segment?.id)) {
        load({ silent: true });
      }
    };
    const refreshConversation = () => load({ silent: true });
    const handleCourierUpdate = async ({ request } = {}) => {
      if (!isCourier || Number(request?.serviceType?.id) !== Number(segment?.id)) return;
      if (Number(request.requesterUserId) !== Number(session.user?.id)) return;
      setCourierRequest(request.status === "PENDENTE" || request.status === "ACEITA" ? request : null);
      if (request.status === "ACEITA" && request.conversationId) {
        try {
          const response = await getServiceConversation(session.accessToken, request.conversationId);
          navigation.replace("ServiceConversation", { conversation: response.conversation });
        } catch {
          load({ silent: true });
        }
      }
    };
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refreshProviders);
    socket?.on(realtimeEvents.courierRequestUpdated, handleCourierUpdate);
    socket?.on(realtimeEvents.serviceChatCreated, refreshConversation);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refreshConversation);
    socket?.on(realtimeEvents.serviceChatUpdated, refreshConversation);
    return () => {
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refreshProviders);
      socket?.off(realtimeEvents.courierRequestUpdated, handleCourierUpdate);
      socket?.off(realtimeEvents.serviceChatCreated, refreshConversation);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refreshConversation);
      socket?.off(realtimeEvents.serviceChatUpdated, refreshConversation);
    };
  }, [isCourier, load, navigation, segment?.id, session?.accessToken, session?.user?.id]);

  useEffect(() => {
    if (!isCourier || courierRequest?.status !== "ACEITA" || !courierRequest.conversationId || !session?.accessToken) return;
    let active = true;
    getServiceConversation(session.accessToken, courierRequest.conversationId)
      .then((response) => {
        if (active) navigation.replace("ServiceConversation", { conversation: response.conversation });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [courierRequest?.conversationId, courierRequest?.status, isCourier, navigation, session?.accessToken]);

  async function openConversation(seller) {
    if (openingId || !session?.accessToken) return;
    setOpeningId(seller.id); setError("");
    try {
      const response = await createServiceConversation(session.accessToken, {
        description: isCourier ? "Quero combinar uma entrega." : "",
        sellerServiceId: seller.sellerServiceId,
      });
      navigation.navigate("ServiceConversation", { conversation: response.conversation });
    } catch (requestError) { setError(requestError.message ?? "Nao foi possivel iniciar a conversa."); }
    finally { setOpeningId(null); }
  }

  async function callCourier() {
    if (!session?.accessToken || openingId || courierRequest) return;
    setOpeningId("courier");
    setError("");
    try {
      const response = await createCustomerCourierRequest(session.accessToken, {
        description: "Quero combinar uma entrega.",
        serviceTypeId: segment.id,
      });
      setCourierRequest(response.request);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel chamar um motoboy.");
    } finally {
      setOpeningId(null);
    }
  }

  async function cancelCourierCall() {
    if (!session?.accessToken || !courierRequest || openingId) return;
    setOpeningId("cancel");
    setError("");
    try {
      await cancelCourierRequest(session.accessToken, courierRequest.id);
      setCourierRequest(null);
      load({ silent: true });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cancelar a chamada.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader
        eyebrow={isCourier ? "Entrega em tempo real" : "Negociacao por chat"}
        subtitle={isCourier
          ? "Solicite uma entrega. Um motoboy livre aceita e entra no chat com voce."
          : "Escolha quem esta atendendo agora. Combine detalhes, fotos e valor na conversa."}
        title={isCourier ? "Chamar motoboy" : `${segment?.name ?? "Servico"} online`}
      />

      {isCourier ? (
        <View style={styles.courierNotice}>
          <View style={styles.noticeIcon}><Ionicons color={colors.card} name="shield-checkmark-outline" size={19} /></View>
          <View style={styles.copy}>
            <Text style={styles.noticeTitle}>Chamada protegida</Text>
            <Text style={styles.noticeText}>A identidade do motoboy aparece somente depois que ele aceitar sua corrida.</Text>
          </View>
        </View>
      ) : null}

      {loading ? <StatePanel icon="chatbubbles-outline" loading text="Buscando quem esta online..." /> : null}
      {!loading && error ? <StatePanel actionLabel="Tentar de novo" danger icon="alert-circle-outline" onAction={load} text={error} /> : null}
      {!loading && !error && isCourier && activeCourierConversation ? (
        <Pressable
          onPress={() => navigation.navigate("ServiceConversation", { conversation: activeCourierConversation })}
          style={({ pressed }) => [styles.activeChatCard, pressed && styles.pressed]}
        >
          <View style={styles.activeChatIcon}><Ionicons color={colors.card} name="chatbubbles-outline" size={22} /></View>
          <View style={styles.copy}>
            <Text style={styles.availabilityLabel}>ATENDIMENTO EM ANDAMENTO</Text>
            <Text style={styles.availabilityTitle}>Voltar para o chat</Text>
            <Text numberOfLines={1} style={styles.availabilityText}>Continue combinando retirada, destino e pagamento.</Text>
          </View>
          {activeCourierConversation.unreadCount ? <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{activeCourierConversation.unreadCount}</Text></View> : null}
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={19} />
        </Pressable>
      ) : null}
      {!loading && !error && isCourier && !activeCourierConversation && courierRequest?.status === "PENDENTE" ? (
        <View style={styles.waitingCard}>
          <View style={styles.waitingRadar}><ActivityIndicator color={colors.card} /></View>
          <Text style={styles.waitingEyebrow}>CHAMADA ENVIADA</Text>
          <Text style={styles.waitingTitle}>Procurando motoboy</Text>
          <Text style={styles.waitingText}>A chamada continua ativa ate um profissional livre aceitar ou voce cancelar.</Text>
          <Pressable disabled={openingId === "cancel"} onPress={cancelCourierCall} style={styles.cancelButton}>
            {openingId === "cancel" ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.cancelButtonText}>Cancelar chamada</Text>}
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && isCourier && !activeCourierConversation && !courierRequest ? (
        <View style={[styles.availabilityCard, !courierAvailable && styles.availabilityCardOff]}>
          <View style={styles.availabilityIcon}><Ionicons color={courierAvailable ? colors.card : colors.textMuted} name="bicycle-outline" size={25} /></View>
          <View style={styles.copy}>
            <Text style={styles.availabilityLabel}>{courierAvailable ? "SERVICO DISPONIVEL" : "SERVICO INDISPONIVEL"}</Text>
            <Text style={styles.availabilityTitle}>{courierAvailable ? "Chamar motoboy" : "Nenhum motoboy livre agora"}</Text>
            <Text style={styles.availabilityText}>{courierAvailable ? "Envie a chamada sem escolher ou expor profissionais." : "Quando alguem ficar livre, esta pagina atualiza em tempo real."}</Text>
          </View>
          <Pressable disabled={!courierAvailable || openingId === "courier"} onPress={callCourier} style={[styles.callCourierButton, !courierAvailable && styles.callCourierButtonOff]}>
            {openingId === "courier" ? <ActivityIndicator color={colors.card} /> : <Ionicons color={courierAvailable ? colors.card : colors.textMuted} name="arrow-forward" size={19} />}
          </Pressable>
        </View>
      ) : null}
      {!loading && !isCourier && !error && sellers.length ? (
        <View style={styles.list}>
          {sellers.map((seller) => (
            <ProviderCard
              isCourier={isCourier}
              key={seller.id}
              loading={openingId === seller.id}
              onPress={() => openConversation(seller)}
              seller={seller}
            />
          ))}
        </View>
      ) : null}
      {!loading && !isCourier && !error && !sellers.length ? (
        <StatePanel icon="time-outline" text={`Quando um prestador de ${segment?.name ?? "servicos"} ativar o atendimento, ele aparece aqui.`} title="Ninguem online agora" />
      ) : null}
    </ScreenContainer>
  );
}

function ProviderCard({ isCourier, loading, onPress, seller }) {
  const courier = seller.courierProfile;
  const displayName = courier?.displayName ?? seller.name;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, isCourier && styles.courierCard, pressed && styles.pressed]}>
      <View style={styles.cardTopline}>
        <View style={styles.avatar}>
          {seller.photoUrl
            ? <Image source={{ uri: resolveMediaUrl(seller.photoUrl) }} style={styles.avatarImage} />
            : <Text style={styles.avatarText}>{displayName?.[0] ?? "P"}</Text>}
        </View>
        <View style={styles.copy}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
            <View style={styles.online}><View style={styles.dot} /><Text style={styles.onlineText}>Online</Text></View>
          </View>
          <Text numberOfLines={2} style={styles.description}>
            {isCourier && courier
              ? `${courier.vehicleModel}${courier.color ? ` - ${courier.color}` : ""}`
              : seller.description || "Disponivel para combinar seu atendimento."}
          </Text>
        </View>
      </View>

      {isCourier && courier ? (
        <View style={styles.facts}>
          <ProviderFact icon="navigate-outline" text={`Ate ${courier.serviceRadiusKm} km`} />
          <ProviderFact icon="star" text={courier.rating ? courier.rating.toFixed(1) : "Novo"} />
          <ProviderFact icon="checkmark-done-outline" text={`${courier.totalDeliveries} entregas`} />
        </View>
      ) : (
        <Text style={styles.rating}><Ionicons color={colors.warning} name="star" size={13} /> {seller.rating ? seller.rating.toFixed(1) : "Novo prestador"}</Text>
      )}

      <View style={styles.cardAction}>
        <Text style={styles.cardActionText}>{isCourier ? "Chamar motoboy" : "Abrir conversa"}</Text>
        {loading
          ? <ActivityIndicator color={colors.primaryDark} size="small" />
          : <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />}
      </View>
    </Pressable>
  );
}

function ProviderFact({ icon, text }) {
  return <View style={styles.fact}><Ionicons color={colors.primaryDark} name={icon} size={14} /><Text style={styles.factText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  activeChatCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg, ...shadowSoft },
  activeChatIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 48, justifyContent: "center", width: 48 },
  availabilityCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg, ...shadowSoft },
  availabilityCardOff: { backgroundColor: colors.card, borderColor: colors.border },
  availabilityIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 48, justifyContent: "center", width: 48 },
  availabilityLabel: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9 },
  availabilityText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  availabilityTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 52, justifyContent: "center", overflow: "hidden", width: 52 },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, minHeight: 92, padding: spacing.md },
  cardAction: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 34, paddingTop: spacing.sm },
  cardActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  cardTopline: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  callCourierButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  callCourierButtonOff: { backgroundColor: colors.cardMuted },
  cancelButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.md, justifyContent: "center", minHeight: 42, paddingHorizontal: spacing.md },
  cancelButtonText: { color: colors.danger, fontFamily: fonts.bold, fontSize: typography.caption },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  copy: { flex: 1, gap: 5, minWidth: 0 },
  courierCard: { borderColor: colors.primaryLight, ...shadowSoft },
  courierNotice: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  description: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  dot: { backgroundColor: colors.success, borderRadius: radius.round, height: 6, width: 6 },
  fact: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  factText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  list: { gap: spacing.sm },
  name: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.small },
  nameLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  noticeIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  noticeText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  noticeTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  online: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 4 },
  onlineText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  pressed: { opacity: 0.8 },
  rating: { alignItems: "center", color: colors.textMuted, flexDirection: "row", fontFamily: fonts.medium, fontSize: 11, gap: 3 },
  waitingCard: { alignItems: "center", backgroundColor: "#083F32", borderRadius: radius.lg, gap: spacing.sm, padding: spacing.xl, ...shadowSoft },
  waitingEyebrow: { color: "#A7F3D0", fontFamily: fonts.extraBold, fontSize: 9 },
  waitingRadar: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.round, height: 52, justifyContent: "center", width: 52 },
  waitingText: { color: "#CDEFE2", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18, textAlign: "center" },
  waitingTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  unreadBadge: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, height: 24, justifyContent: "center", minWidth: 24, paddingHorizontal: 6 },
  unreadBadgeText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 10 },
});
