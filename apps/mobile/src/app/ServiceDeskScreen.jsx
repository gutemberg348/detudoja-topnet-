import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import {
  acceptCourierRequest,
  getCourierRequests,
  saveCourierProfile,
} from "../services/courier.api";
import { getSellerProfile } from "../services/seller.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  getSellerServices,
  getServiceConversations,
  updateSellerService,
} from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";
import { CourierRegistrationModal } from "./service/CourierRegistrationModal";

const serviceIconMap = {
  bicycle: "bicycle-outline",
  car: "car-outline",
  construct: "construct-outline",
  delivery: "cube-outline",
  person: "person-outline",
};

function serviceIcon(iconName) {
  return serviceIconMap[String(iconName ?? "").toLowerCase()] ?? "briefcase-outline";
}

function conversationStatus(conversation) {
  if (conversation.status === "ACORDADA") return "Em atendimento";
  if (conversation.status === "AGUARDANDO_CONFIRMACAO") return "Aguardando cliente";
  if (conversation.status === "ENCERRADA") return "Encerrado";
  if (conversation.status === "CANCELADA") return "Cancelado";
  return "Novo chamado";
}

export function ServiceDeskScreen({ navigation }) {
  const { session } = useAuthStore();
  const [conversations, setConversations] = useState([]);
  const [courierRequests, setCourierRequests] = useState([]);
  const [courierError, setCourierError] = useState("");
  const [courierModalOpen, setCourierModalOpen] = useState(false);
  const [courierProfile, setCourierProfile] = useState(null);
  const [courierSaving, setCourierSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [pendingCourierService, setPendingCourierService] = useState(null);
  const [savingServiceId, setSavingServiceId] = useState(null);
  const [acceptingRequestId, setAcceptingRequestId] = useState(null);
  const [services, setServices] = useState([]);

  const activeServices = useMemo(
    () => services.filter((service) => service.available),
    [services],
  );
  const openCalls = useMemo(
    () => conversations.filter((conversation) => ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)),
    [conversations],
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const [profileResponse, servicesResponse, conversationsResponse, requestsResponse] = await Promise.all([
        getSellerProfile(session.accessToken),
        getSellerServices(session.accessToken),
        getServiceConversations(session.accessToken),
        getCourierRequests(session.accessToken),
      ]);
      setProfile(profileResponse.profile ?? null);
      setCourierProfile(servicesResponse.courierProfile ?? null);
      setServices(servicesResponse.services ?? []);
      setConversations((conversationsResponse.conversations ?? []).filter((conversation) => conversation.isSeller));
      setCourierRequests(requestsResponse.requests ?? []);
    } catch (requestError) {
      if (!silent) setError(requestError.message ?? "Nao foi possivel carregar seus servicos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const nextExpiry = courierRequests
      .map((request) => new Date(request.expiresAt).getTime())
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextExpiry) return undefined;
    const timer = setTimeout(() => load({ silent: true }), Math.max(0, nextExpiry - Date.now()) + 250);
    return () => clearTimeout(timer);
  }, [courierRequests, load]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => load({ silent: true });
    socket?.on(realtimeEvents.serviceChatCreated, refresh);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refresh);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refresh);
    socket?.on(realtimeEvents.serviceChatUpdated, refresh);
    socket?.on(realtimeEvents.courierRequestCreated, refresh);
    socket?.on(realtimeEvents.courierRequestUpdated, refresh);
    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refresh);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refresh);
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refresh);
      socket?.off(realtimeEvents.serviceChatUpdated, refresh);
      socket?.off(realtimeEvents.courierRequestCreated, refresh);
      socket?.off(realtimeEvents.courierRequestUpdated, refresh);
    };
  }, [load, session?.accessToken]);

  async function toggleService(service) {
    if (!session?.accessToken || savingServiceId) return;
    if (!service.available && service.requiresCourierProfile && !courierProfile) {
      setPendingCourierService(service);
      setCourierError("");
      setCourierModalOpen(true);
      return;
    }
    setSavingServiceId(service.id);
    setError("");
    try {
      await updateSellerService(session.accessToken, {
        available: !service.available,
        serviceTypeId: service.id,
      });
      setServices((current) => current.map((item) => (
        item.id === service.id ? { ...item, available: !item.available, enabled: true } : item
      )));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel atualizar a disponibilidade.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function submitCourierProfile(data) {
    if (!session?.accessToken || courierSaving) return;
    setCourierSaving(true);
    setCourierError("");

    try {
      const response = await saveCourierProfile(session.accessToken, data);
      setCourierProfile(response.profile);

      if (pendingCourierService) {
        await updateSellerService(session.accessToken, {
          available: true,
          serviceTypeId: pendingCourierService.id,
        });
        setServices((current) => current.map((item) => (
          item.id === pendingCourierService.id
            ? { ...item, available: true, enabled: true }
            : item
        )));
      }

      setPendingCourierService(null);
      setCourierModalOpen(false);
    } catch (requestError) {
      setCourierError(requestError.message ?? "Nao foi possivel salvar o cadastro de motoboy.");
    } finally {
      setCourierSaving(false);
    }
  }

  async function acceptRequest(request) {
    if (!session?.accessToken || acceptingRequestId) return;
    setAcceptingRequestId(request.id);
    setError("");
    try {
      const response = await acceptCourierRequest(session.accessToken, request.id);
      setCourierRequests((current) => current.filter((item) => item.id !== request.id));
      navigation.navigate("ServiceConversation", { conversation: response.conversation });
    } catch (requestError) {
      setError(requestError.message ?? "Esta chamada nao esta mais disponivel.");
      load({ silent: true });
    } finally {
      setAcceptingRequestId(null);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader
        action={<StatusPill activeCount={activeServices.length} />}
        eyebrow="Prestador de servicos"
        subtitle="Escolha o que atende agora e acompanhe os chamados recebidos pelo chat."
        title={`Servicos de ${profile?.publicName ?? "voce"}`}
      />

      {loading ? <StatePanel icon="briefcase-outline" loading text="Carregando sua operacao..." /> : null}
      {!loading && error ? <StatePanel actionLabel="Tentar de novo" danger icon="alert-circle-outline" onAction={load} text={error} title="Nao foi possivel carregar" /> : null}

      {!loading && !error ? (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryIcon}><Ionicons color={colors.card} name="radio-outline" size={22} /></View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>{activeServices.length ? "Recebendo chamados" : "Voce esta offline"}</Text>
              <Text style={styles.summaryText}>
                {activeServices.length
                  ? `${activeServices.map((service) => service.name).join(" e ")} aparece para clientes e lojas.`
                  : "Ative ao menos um servico para aparecer nas buscas."}
              </Text>
            </View>
          </View>

          {courierProfile ? (
            <Pressable
              onPress={() => {
                setPendingCourierService(null);
                setCourierError("");
                setCourierModalOpen(true);
              }}
              style={({ pressed }) => [styles.courierProfile, pressed && styles.pressed]}
            >
              <View style={styles.courierProfileIcon}>
                <Ionicons color={colors.card} name="bicycle-outline" size={21} />
              </View>
              <View style={styles.serviceCopy}>
                <View style={styles.profileTopline}>
                  <Text numberOfLines={1} style={styles.courierProfileName}>{courierProfile.displayName}</Text>
                  <View style={styles.verifiedPill}>
                    <Ionicons color={colors.primaryDark} name="checkmark-circle" size={13} />
                    <Text style={styles.verifiedText}>Cadastro ativo</Text>
                  </View>
                </View>
                <Text style={styles.courierProfileMeta}>{courierProfile.vehicleModel} - {courierProfile.color} - {courierProfile.plate}</Text>
                <Text style={styles.courierProfileRadius}>Atende em um raio de ate {courierProfile.serviceRadiusKm} km</Text>
              </View>
              <Ionicons color={colors.textMuted} name="create-outline" size={19} />
            </Pressable>
          ) : null}

          {courierRequests.length ? (
            <>
              <SectionTitle
                icon="notifications-outline"
                subtitle="Aceite para entrar no chat e combinar valor e entrega"
                title="Corridas aguardando"
                value={courierRequests.length}
              />
              <View style={styles.requestList}>
                {courierRequests.map((request) => (
                  <CourierRequestCard
                    key={request.id}
                    loading={acceptingRequestId === request.id}
                    onAccept={() => acceptRequest(request)}
                    request={request}
                  />
                ))}
              </View>
            </>
          ) : null}

          <SectionTitle icon="flash-outline" subtitle="Ative apenas o que voce consegue atender agora" title="Minha disponibilidade" />
          {services.length ? (
            <View style={styles.serviceList}>
              {services.map((service) => (
                <View key={service.id} style={[styles.serviceCard, service.available && styles.serviceCardActive]}>
                  <View style={styles.serviceIcon}><Ionicons color={colors.primaryDark} name={serviceIcon(service.iconName)} size={21} /></View>
                  <View style={styles.serviceCopy}>
                    <View style={styles.serviceNameLine}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      {service.requiresCourierProfile ? (
                        <View style={styles.deliveryPill}>
                          <Ionicons color={colors.primaryDark} name="storefront-outline" size={12} />
                          <Text style={styles.deliveryPillText}>Chamadas de lojas</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.serviceMeta}>
                      {service.available
                        ? "Online e disponivel para novas chamadas"
                        : service.requiresCourierProfile && !courierProfile
                          ? "Cadastre sua moto para ativar"
                          : "Offline para novos chamados"}
                    </Text>
                  </View>
                  {savingServiceId === service.id ? <ActivityIndicator color={colors.primaryDark} /> : <Switch disabled={Boolean(savingServiceId)} onValueChange={() => toggleService(service)} thumbColor={colors.card} trackColor={{ false: colors.borderStrong, true: colors.primary }} value={service.available} />}
                </View>
              ))}
            </View>
          ) : (
            <StatePanel icon="construct-outline" text="Nenhum servico esta ativo no admin. Cadastre ou ative Frete ou Motoboy no painel administrativo." title="Servicos indisponiveis" />
          )}

          <SectionTitle icon="chatbubbles-outline" subtitle="Conversas reais enviadas por clientes" title="Chamados" value={openCalls.length} />
          {openCalls.length ? (
            <View style={styles.callsList}>
              {openCalls.map((conversation) => (
                <ServiceCallCard
                  conversation={conversation}
                  key={conversation.id}
                  onPress={() => navigation.navigate("ServiceConversation", { conversation })}
                />
              ))}
            </View>
          ) : (
            <StatePanel icon="chatbubble-ellipses-outline" text="Quando um cliente escolher voce na busca, o chamado chega aqui em tempo real." title="Nenhum chamado em aberto" />
          )}
        </>
      ) : null}
      <CourierRegistrationModal
        error={courierError}
        loading={courierSaving}
        onClose={() => {
          if (courierSaving) return;
          setCourierModalOpen(false);
          setPendingCourierService(null);
        }}
        onSubmit={submitCourierProfile}
        open={courierModalOpen}
        profile={courierProfile}
      />
    </ScreenContainer>
  );
}

function StatusPill({ activeCount }) {
  return <View style={[styles.statusPill, activeCount && styles.statusPillActive]}><View style={[styles.statusDot, activeCount && styles.statusDotActive]} /><Text style={[styles.statusText, activeCount && styles.statusTextActive]}>{activeCount ? `${activeCount} ativo${activeCount === 1 ? "" : "s"}` : "Offline"}</Text></View>;
}

function SectionTitle({ icon, subtitle, title, value = null }) {
  return <View style={styles.sectionTitle}><View style={styles.sectionIcon}><Ionicons color={colors.primaryDark} name={icon} size={18} /></View><View style={styles.sectionCopy}><Text style={styles.sectionHeading}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>{value !== null ? <View style={styles.countPill}><Text style={styles.countText}>{value}</Text></View> : null}</View>;
}

function ServiceCallCard({ conversation, onPress }) {
  const store = conversation.request?.store;
  const isDelivery = conversation.serviceType?.operationalType === "ENTREGA_LOCAL";
  const unreadCount = conversation.unreadCount || (conversation.isNewForSeller ? 1 : 0);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.callCard, isDelivery && styles.deliveryCallCard, pressed && styles.pressed]}>
      <View style={[styles.callIcon, isDelivery && styles.deliveryCallIcon]}>
        <Ionicons color={isDelivery ? colors.card : colors.primaryDark} name={isDelivery ? "bicycle-outline" : serviceIcon(conversation.serviceType?.iconName)} size={20} />
      </View>
      <View style={styles.callCopy}>
        <View style={styles.callTopline}>
          <Text numberOfLines={1} style={styles.callName}>{store?.name ?? conversation.otherPerson?.name ?? "Cliente"}</Text>
          <Text style={styles.callStatus}>{conversationStatus(conversation)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.callService}>
          {isDelivery ? "CORRIDA DE LOJA" : conversation.serviceType?.name ?? conversation.segment?.name ?? "Servico"}
        </Text>
        {isDelivery ? (
          <View style={styles.callRoute}>
            <Ionicons color={colors.primaryDark} name="navigate-outline" size={13} />
            <Text numberOfLines={1} style={styles.callRouteText}>{conversation.request?.origin || "Retirada"} - {conversation.request?.destination || "Destino"}</Text>
          </View>
        ) : (
          <Text numberOfLines={1} style={styles.callMessage}>{conversation.lastMessage?.text || "Novo chamado aguardando sua resposta."}</Text>
        )}
      </View>
      {unreadCount ? (
        <View style={styles.unread}><Text style={styles.unreadText}>{unreadCount}</Text></View>
      ) : (
        <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
      )}
    </Pressable>
  );
}

function CourierRequestCard({ loading, onAccept, request }) {
  const isDirect = request.type === "EQUIPE";
  return (
    <View style={[styles.requestCard, isDirect && styles.requestCardDirect]}>
      <View style={styles.requestTopline}>
        <View style={styles.requestIcon}><Ionicons color={colors.card} name="bicycle-outline" size={20} /></View>
        <View style={styles.copy}>
          <View style={styles.requestNameLine}>
            <Text numberOfLines={1} style={styles.requestName}>{request.store?.name ?? "Loja"}</Text>
            {isDirect ? <View style={styles.directPill}><Text style={styles.directPillText}>SUA EQUIPE</Text></View> : null}
          </View>
          <Text style={styles.requestCaption}>{isDirect ? "Chamada direta da loja" : "Chamada da plataforma"}</Text>
        </View>
      </View>
      <View style={styles.routeBox}>
        <View style={styles.routeRow}><Ionicons color={colors.primaryDark} name="location-outline" size={15} /><Text numberOfLines={2} style={styles.routeText}>{request.origin}</Text></View>
        <View style={styles.routeDivider} />
        <View style={styles.routeRow}><Ionicons color={colors.danger} name="flag-outline" size={15} /><Text numberOfLines={2} style={styles.routeText}>{request.destination}</Text></View>
      </View>
      {request.description ? <Text numberOfLines={2} style={styles.requestDescription}>{request.description}</Text> : null}
      <Pressable disabled={loading} onPress={onAccept} style={({ pressed }) => [styles.acceptButton, pressed && styles.pressed]}>
        {loading ? <ActivityIndicator color={colors.card} /> : <><Ionicons color={colors.card} name="checkmark-circle-outline" size={18} /><Text style={styles.acceptButtonText}>Aceitar corrida</Text><Ionicons color={colors.card} name="arrow-forward" size={18} /></>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  acceptButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.md },
  acceptButtonText: { color: colors.card, flex: 1, fontFamily: fonts.bold, fontSize: typography.small, textAlign: "center" },
  callCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 86, padding: spacing.md, ...shadowSoft },
  callCopy: { flex: 1, gap: 3, minWidth: 0 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  callIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  callMessage: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  callName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.bold, fontSize: typography.small },
  callService: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 11 },
  callRoute: { alignItems: "center", flexDirection: "row", gap: 5 },
  callRouteText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: 11 },
  callStatus: { color: colors.info, fontFamily: fonts.bold, fontSize: 10 },
  callTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  callsList: { gap: spacing.sm },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  courierProfile: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md, ...shadowSoft },
  courierProfileIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  courierProfileMeta: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: typography.caption },
  courierProfileName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.label },
  courierProfileRadius: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  countPill: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 26, justifyContent: "center", minWidth: 26, paddingHorizontal: 7 },
  countText: { color: colors.card, fontFamily: fonts.extraBold, fontSize: 11 },
  deliveryPill: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  deliveryPillText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
  deliveryCallCard: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  deliveryCallIcon: { backgroundColor: colors.primaryDark },
  directPill: { backgroundColor: colors.warningSoft ?? "#FFF4D8", borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 3 },
  directPillText: { color: "#7A4A00", fontFamily: fonts.extraBold, fontSize: 8 },
  pressed: { opacity: 0.78 },
  requestCaption: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  requestCard: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadowSoft },
  requestCardDirect: { borderColor: colors.warning ?? "#F5B942" },
  requestDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  requestIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  requestList: { gap: spacing.sm },
  requestName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.small },
  requestNameLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  requestTopline: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  routeBox: { backgroundColor: colors.backgroundSoft, borderRadius: radius.md, gap: spacing.sm, padding: spacing.sm },
  routeDivider: { backgroundColor: colors.border, height: 1, marginLeft: 23 },
  routeRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  routeText: { color: colors.textPrimary, flex: 1, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  sectionCopy: { flex: 1, gap: 2, minWidth: 0 },
  sectionHeading: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  sectionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  sectionTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  serviceCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 76, padding: spacing.md },
  serviceCardActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  serviceCopy: { flex: 1, gap: 3, minWidth: 0 },
  serviceIcon: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  serviceList: { gap: spacing.sm },
  serviceMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  serviceName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  serviceNameLine: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  statusDot: { backgroundColor: colors.textMuted, borderRadius: radius.round, height: 7, width: 7 },
  statusDotActive: { backgroundColor: colors.success },
  statusPill: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  statusPillActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  statusText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10 },
  statusTextActive: { color: colors.primaryDark },
  summary: { alignItems: "center", backgroundColor: "#083F32", borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, padding: spacing.lg, ...shadowSoft },
  summaryCopy: { flex: 1, gap: 4, minWidth: 0 },
  summaryIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  summaryText: { color: "#CDEFE2", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  summaryTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.label },
  profileTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  unread: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, height: 24, justifyContent: "center", minWidth: 24, paddingHorizontal: 6 },
  unreadText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 10 },
  verifiedPill: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  verifiedText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
});
