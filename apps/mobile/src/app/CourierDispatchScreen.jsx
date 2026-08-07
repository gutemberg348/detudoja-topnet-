import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  createServiceConversation,
  getOnlineServiceProviders,
  getServiceConversations,
  getServiceTypes,
} from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

const activeStatuses = new Set(["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"]);

export function CourierDispatchScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const store = route.params?.store;
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [types, setTypes] = useState([]);

  const loadOverview = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !store?.id) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const [typesResponse, conversationsResponse] = await Promise.all([
        getServiceTypes(session.accessToken, { operationalType: "ENTREGA_LOCAL" }),
        getServiceConversations(session.accessToken),
      ]);
      const nextTypes = typesResponse.serviceTypes ?? [];
      setTypes(nextTypes);
      setSelectedType((current) => (
        nextTypes.find((item) => item.id === current?.id) ?? nextTypes[0] ?? null
      ));
      setConversations((conversationsResponse.conversations ?? []).filter(
        (conversation) => (
          Number(conversation.request?.store?.id) === Number(store.id)
          && activeStatuses.has(conversation.status)
        ),
      ));
    } catch (requestError) {
      if (!silent) setError(requestError.message ?? "Nao foi possivel abrir a central de entregas.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [session?.accessToken, store?.id]);

  const loadProviders = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !selectedType?.id) {
      setProviders([]);
      return;
    }
    if (!silent) setError("");

    try {
      const response = await getOnlineServiceProviders(session.accessToken, selectedType.id, {
        storeId: store.id,
      });
      setProviders(response.sellers ?? []);
    } catch (requestError) {
      if (!silent) setError(requestError.message ?? "Nao foi possivel buscar motoboys online.");
    }
  }, [selectedType?.id, session?.accessToken, store?.id]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadProviders(); }, [loadProviders]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshAvailability = (payload = {}) => {
      if (Number(payload.serviceTypeId) === Number(selectedType?.id)) {
        loadProviders({ silent: true });
      }
    };
    const refreshConversations = () => loadOverview({ silent: true });
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refreshAvailability);
    socket?.on(realtimeEvents.serviceChatCreated, refreshConversations);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refreshConversations);
    socket?.on(realtimeEvents.serviceChatUpdated, refreshConversations);
    return () => {
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refreshAvailability);
      socket?.off(realtimeEvents.serviceChatCreated, refreshConversations);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refreshConversations);
      socket?.off(realtimeEvents.serviceChatUpdated, refreshConversations);
    };
  }, [loadOverview, loadProviders, selectedType?.id, session?.accessToken]);

  const filteredProviders = useMemo(() => {
    const term = normalize(search);
    if (!term) return providers;
    return providers.filter((provider) => normalize([
      provider.name,
      provider.courierProfile?.displayName,
      provider.courierProfile?.vehicleModel,
      provider.courierProfile?.color,
    ].filter(Boolean).join(" ")).includes(term));
  }, [providers, search]);

  async function requestCourier(form) {
    if (!session?.accessToken || !selectedProvider || openingId) return;
    setOpeningId(selectedProvider.id);
    setError("");
    try {
      const response = await createServiceConversation(session.accessToken, {
        description: form.description,
        destination: form.destination,
        orderId: form.orderId || undefined,
        origin: form.origin,
        sellerServiceId: selectedProvider.sellerServiceId,
        storeId: store.id,
      });
      setSelectedProvider(null);
      navigation.navigate("ServiceConversation", { conversation: response.conversation });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel chamar este motoboy.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader
        action={<AvailabilityState available={providers.length > 0} />}
        eyebrow="Entregas da loja"
        subtitle="Escolha quem esta disponivel, informe a rota e continue tudo pelo chat."
        title="Chamar motoboy"
      />

      <View style={styles.storeStrip}>
        <View style={styles.storeIcon}><Ionicons color={colors.primaryDark} name="storefront-outline" size={20} /></View>
        <View style={styles.flexCopy}>
          <Text style={styles.storeLabel}>SAINDO DE</Text>
          <Text numberOfLines={1} style={styles.storeName}>{store?.name ?? "Sua loja"}</Text>
          <Text numberOfLines={1} style={styles.storeAddress}>{formatAddress(store?.address) || "Informe o ponto de retirada ao chamar"}</Text>
        </View>
      </View>

      {loading ? <StatePanel icon="bicycle-outline" loading text="Buscando entregadores disponiveis..." /> : null}
      {!loading && error && !selectedProvider ? <StatePanel actionLabel="Tentar novamente" danger icon="alert-circle-outline" onAction={loadOverview} text={error} /> : null}

      {!loading ? (
        <>
          {conversations.length ? (
            <View style={styles.section}>
              <SectionTitle icon="navigate-circle-outline" title="Corridas em andamento" value={conversations.length} />
              <View style={styles.list}>
                {conversations.map((conversation) => (
                  <Pressable key={conversation.id} onPress={() => navigation.navigate("ServiceConversation", { conversation })} style={({ pressed }) => [styles.activeRide, pressed && styles.pressed]}>
                    <View style={styles.activeRideIcon}><Ionicons color={colors.card} name="bicycle-outline" size={19} /></View>
                    <View style={styles.flexCopy}>
                      <Text numberOfLines={1} style={styles.providerName}>{conversation.otherPerson?.name ?? "Motoboy"}</Text>
                      <Text numberOfLines={1} style={styles.providerMeta}>{conversation.request?.destination || "Destino combinado no chat"}</Text>
                    </View>
                    {conversation.unreadCount ? <View style={styles.unread}><Text style={styles.unreadText}>{conversation.unreadCount}</Text></View> : null}
                    <Ionicons color={colors.primaryDark} name="chevron-forward" size={18} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionTitle icon="radio-outline" title="Disponiveis agora" />
            {types.length > 1 ? (
              <ScrollView contentContainerStyle={styles.typeList} horizontal showsHorizontalScrollIndicator={false}>
                {types.map((type) => (
                  <Pressable key={type.id} onPress={() => setSelectedType(type)} style={[styles.typeChip, selectedType?.id === type.id && styles.typeChipActive]}>
                    <Text style={[styles.typeChipText, selectedType?.id === type.id && styles.typeChipTextActive]}>{type.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.searchField}>
              <Ionicons color={colors.textMuted} name="search-outline" size={20} />
              <TextInput onChangeText={setSearch} placeholder="Buscar por nome, moto ou cor" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
            </View>

            {filteredProviders.length ? (
              <View style={styles.list}>
                {filteredProviders.map((provider) => (
                  <CourierCard key={provider.id} onPress={() => setSelectedProvider(provider)} provider={provider} />
                ))}
              </View>
            ) : (
              <StatePanel icon="time-outline" text="Assim que um motoboy ativar a disponibilidade, ele aparece aqui sem atualizar a pagina." title="Nenhum motoboy online" />
            )}
          </View>
        </>
      ) : null}

      <CourierRequestModal
        error={selectedProvider ? error : ""}
        loading={Boolean(openingId)}
        onClose={() => {
          if (!openingId) setSelectedProvider(null);
        }}
        onSubmit={requestCourier}
        open={Boolean(selectedProvider)}
        provider={selectedProvider}
        store={store}
      />
    </ScreenContainer>
  );
}

function CourierCard({ onPress, provider }) {
  const courier = provider.courierProfile ?? {};
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.providerCard, pressed && styles.pressed]}>
      <View style={styles.avatar}>
        {provider.photoUrl ? <Image source={{ uri: resolveMediaUrl(provider.photoUrl) }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{provider.name?.[0] ?? "M"}</Text>}
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.flexCopy}>
        <View style={styles.providerTopline}>
          <Text numberOfLines={1} style={styles.providerName}>{courier.displayName || provider.name}</Text>
          <View style={styles.onlinePill}><Text style={styles.onlinePillText}>ONLINE</Text></View>
        </View>
        <Text numberOfLines={1} style={styles.providerMeta}>{[courier.vehicleModel, courier.color].filter(Boolean).join(" · ") || "Moto cadastrada"}</Text>
        <View style={styles.providerStats}>
          <Text style={styles.providerStat}><Ionicons color={colors.warning} name="star" size={12} /> {courier.rating ? courier.rating.toFixed(1) : "Novo"}</Text>
          <Text style={styles.providerStat}>{courier.totalDeliveries ?? 0} entregas</Text>
          <Text style={styles.providerStat}>ate {courier.serviceRadiusKm ?? 10} km</Text>
        </View>
      </View>
      <View style={styles.callButton}><Ionicons color={colors.card} name="arrow-forward" size={18} /></View>
    </Pressable>
  );
}

function CourierRequestModal({ error, loading, onClose, onSubmit, open, provider, store }) {
  const [form, setForm] = useState({ description: "", destination: "", orderId: null, origin: "" });
  const orders = (store?.orders ?? []).filter((order) => activeStatusesForOrder(order.status));

  useEffect(() => {
    if (!open) return;
    setForm({ description: "", destination: "", orderId: null, origin: formatAddress(store?.address) });
  }, [open, store?.id]);

  function selectOrder(order) {
    setForm((current) => ({
      ...current,
      destination: formatAddress(order.address),
      orderId: order.id,
    }));
  }

  const valid = form.origin.trim().length >= 4 && form.destination.trim().length >= 4;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}><Ionicons color={colors.primaryDark} name="navigate-outline" size={22} /></View>
            <View style={styles.flexCopy}>
              <Text style={styles.storeLabel}>NOVA CORRIDA</Text>
              <Text style={styles.modalTitle}>Chamar {provider?.courierProfile?.displayName || provider?.name}</Text>
              <Text style={styles.modalSubtitle}>{provider?.courierProfile?.vehicleModel} · {provider?.courierProfile?.plate}</Text>
            </View>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.modalClose}><Ionicons color={colors.textPrimary} name="close" size={21} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {orders.length ? (
              <View style={styles.orderPicker}>
                <Text style={styles.inputLabel}>Vincular a um pedido</Text>
                <ScrollView contentContainerStyle={styles.typeList} horizontal showsHorizontalScrollIndicator={false}>
                  {orders.map((order) => (
                    <Pressable key={order.id} onPress={() => selectOrder(order)} style={[styles.orderChip, form.orderId === order.id && styles.orderChipActive]}>
                      <Text style={[styles.orderChipText, form.orderId === order.id && styles.orderChipTextActive]}>#{String(order.code ?? order.id).slice(-6)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <AppInput icon="storefront-outline" label="Retirada" multiline onChangeText={(origin) => setForm((current) => ({ ...current, origin }))} placeholder="Endereco de retirada" value={form.origin} />
            <AppInput icon="location-outline" label="Destino" multiline onChangeText={(destination) => setForm((current) => ({ ...current, destination }))} placeholder="Endereco de entrega" value={form.destination} />
            <AppInput icon="reader-outline" label="Instrucoes" multiline onChangeText={(description) => setForm((current) => ({ ...current, description }))} placeholder="Produto, contato, referencia ou cuidado especial" value={form.description} />
            <View style={styles.safetyStrip}><Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={18} /><Text style={styles.safetyText}>O motoboy recebe a chamada em tempo real. Valor, pagamento e atualizacoes continuam no chat.</Text></View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <AppButton disabled={!valid} icon="navigate-outline" loading={loading} onPress={() => onSubmit(form)} title="Chamar motoboy" />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AvailabilityState({ available }) {
  return <View style={styles.onlineCount}><View style={[styles.onlineCountDot, !available && styles.onlineCountDotOffline]} /><Text style={[styles.onlineCountText, !available && styles.onlineCountTextOffline]}>{available ? "Disponivel" : "Indisponivel"}</Text></View>;
}

function SectionTitle({ icon, title, value }) {
  return <View style={styles.sectionTitle}><View style={styles.sectionIcon}><Ionicons color={colors.primaryDark} name={icon} size={18} /></View><Text style={styles.sectionTitleText}>{title}</Text>{value !== undefined ? <View style={styles.countPill}><Text style={styles.countPillText}>{value}</Text></View> : null}</View>;
}

function activeStatusesForOrder(status) {
  return !["CANCELADO", "CONCLUIDO"].includes(status);
}

function formatAddress(address) {
  if (!address) return "";
  return [
    [address.rua, address.numero].filter(Boolean).join(", "),
    address.bairro,
    [address.cidade, address.estado].filter(Boolean).join(" - "),
  ].filter(Boolean).join(" · ");
}

function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const styles = StyleSheet.create({
  activeRide: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  activeRideIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 },
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 52, justifyContent: "center", position: "relative", width: 52 },
  avatarImage: { borderRadius: radius.round, height: "100%", width: "100%" },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  callButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  countPill: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 26, justifyContent: "center", minWidth: 26, paddingHorizontal: 7 },
  countPillText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 11 },
  errorText: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.caption },
  flexCopy: { flex: 1, minWidth: 0 },
  inputLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  list: { gap: spacing.sm },
  modalCard: { alignSelf: "center", backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "92%", maxWidth: 560, padding: spacing.lg, width: "100%", ...shadowSoft },
  modalClose: { alignItems: "center", backgroundColor: colors.cardMuted, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  modalForm: { gap: spacing.lg, paddingBottom: spacing.xxl },
  modalHandle: { alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: radius.round, height: 4, marginBottom: spacing.md, width: 42 },
  modalHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  modalHeaderIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 44, justifyContent: "center", width: 44 },
  modalOverlay: { backgroundColor: "rgba(20,32,25,0.42)", flex: 1, justifyContent: "flex-end" },
  modalSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, marginTop: 3 },
  modalTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  onlineCount: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  onlineCountDot: { backgroundColor: colors.success, borderRadius: radius.round, height: 7, width: 7 },
  onlineCountDotOffline: { backgroundColor: colors.textMuted },
  onlineCountText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  onlineCountTextOffline: { color: colors.textMuted },
  onlineDot: { backgroundColor: colors.success, borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, bottom: 0, height: 14, position: "absolute", right: 0, width: 14 },
  onlinePill: { backgroundColor: colors.primarySoft, borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 3 },
  onlinePillText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9 },
  orderChip: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  orderChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  orderChipText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption },
  orderChipTextActive: { color: colors.card },
  orderPicker: { gap: spacing.sm },
  pressed: { opacity: 0.78 },
  providerCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 96, padding: spacing.md, ...shadowSoft },
  providerMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, marginTop: 4 },
  providerName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.small },
  providerStat: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  providerStats: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 5 },
  providerTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  safetyStrip: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  safetyText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 17 },
  searchField: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 50, paddingHorizontal: spacing.md },
  searchInput: { color: colors.textPrimary, flex: 1, fontFamily: fonts.regular, fontSize: typography.small, minHeight: 48, outlineStyle: "none" },
  section: { gap: spacing.md },
  sectionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  sectionTitle: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionTitleText: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.label },
  storeAddress: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, marginTop: 3 },
  storeIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  storeLabel: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0 },
  storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, marginTop: 2 },
  storeStrip: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  typeChip: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  typeChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  typeChipText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption },
  typeChipTextActive: { color: colors.card },
  typeList: { gap: spacing.sm, paddingRight: spacing.lg },
  unread: { alignItems: "center", backgroundColor: colors.warning, borderRadius: radius.round, height: 23, justifyContent: "center", minWidth: 23, paddingHorizontal: 5 },
  unreadText: { color: "#4A2B00", fontFamily: fonts.extraBold, fontSize: 10 },
});
