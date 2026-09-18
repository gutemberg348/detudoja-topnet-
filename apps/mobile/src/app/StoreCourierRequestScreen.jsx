import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AppInput } from "../components/AppInput";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import {
  cancelCourierRequest,
  createStoreCourierRequest,
  getStoreCourierDispatch,
} from "../services/courier.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getServiceConversation } from "../services/service-chats.api";
import { serviceIconName } from "../utils/service-icons";
import { searchAddresses } from "../services/cep.api";
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

function storeAddress(store) {
  const address = store?.address;
  return [address?.street, address?.number, address?.district, address?.city, address?.state].filter(Boolean).join(", ");
}

function suggestionLabel(address) {
  return [address.street, address.district, address.city, address.state].filter(Boolean).join(", ");
}

export function StoreCourierRequestScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const store = route.params?.store;
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSearched, setAddressSearched] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [destinationSelected, setDestinationSelected] = useState(false);
  const [dispatch, setDispatch] = useState({ currentRequest: null, platformAvailable: false, serviceType: null, serviceTypes: [], team: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState(() => storeAddress(store));
  const [saving, setSaving] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState(null);
  const canRequest = useMemo(() => origin.trim().length >= 5 && destination.trim().length >= 5, [destination, origin]);
  const serviceName = dispatch.currentRequest?.serviceType?.name ?? dispatch.serviceType?.name ?? "Corrida";
  const serviceIcon = serviceIconName(dispatch.serviceType?.iconName, "navigate-outline");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !store?.id) return;
    if (!silent) setLoading(true);
    try {
      const response = await getStoreCourierDispatch(session.accessToken, store.id, serviceTypeId);
      setDispatch(response);
      if (response.serviceType?.id && Number(response.serviceType.id) !== Number(serviceTypeId)) {
        setServiceTypeId(response.serviceType.id);
      }
    }
    catch (requestError) { if (!silent) setError(requestError.message ?? "Nao foi possivel preparar a entrega."); }
    finally { if (!silent) setLoading(false); }
  }, [serviceTypeId, session?.accessToken, store?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const query = destination.trim();
    const city = store?.address?.city;
    const state = store?.address?.state;
    if (destinationSelected || query.length < 3 || !city || !state) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      setAddressSearched(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const suggestions = await searchAddresses({ city, state, street: query });
        if (active) {
          setAddressSuggestions(suggestions);
          setAddressSearched(true);
        }
      } catch {
        if (active) {
          setAddressSuggestions([]);
          setAddressSearched(true);
        }
      } finally {
        if (active) setAddressLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [destination, destinationSelected, store?.address?.city, store?.address?.state]);
  useEffect(() => {
    const current = dispatch.currentRequest;
    if (!session?.accessToken || current?.status !== "ACEITA" || !current.conversationId) return;
    getServiceConversation(session.accessToken, current.conversationId)
      .then((response) => navigation.replace("ServiceConversation", { conversation: response.conversation }))
      .catch(() => setError("A corrida foi aceita, mas nao foi possivel abrir o chat agora."));
  }, [dispatch.currentRequest, navigation, session?.accessToken]);
  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const handleUpdate = async ({ request } = {}) => {
      if (Number(request?.storeId) !== Number(store?.id)) return;
      if (request.status === "ACEITA" && request.conversationId) {
        try {
          const response = await getServiceConversation(session.accessToken, request.conversationId);
          navigation.replace("ServiceConversation", { conversation: response.conversation });
        } catch { load({ silent: true }); }
        return;
      }
      load({ silent: true });
    };
    const refresh = () => load({ silent: true });
    socket?.on(realtimeEvents.courierRequestUpdated, handleUpdate);
    socket?.on(realtimeEvents.courierTeamUpdated, refresh);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refresh);
    return () => {
      socket?.off(realtimeEvents.courierRequestUpdated, handleUpdate);
      socket?.off(realtimeEvents.courierTeamUpdated, refresh);
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refresh);
    };
  }, [load, navigation, session?.accessToken, store?.id]);

  async function callCourier(teamMemberId) {
    if (!canRequest || !dispatch.serviceType?.id || saving) return;
    setSaving(true); setError("");
    try {
      const response = await createStoreCourierRequest(session.accessToken, store.id, {
        description,
        destination,
        origin,
        ...(route.params?.orderId ? { orderId: route.params.orderId } : {}),
        serviceTypeId: dispatch.serviceType.id,
        ...(teamMemberId ? { teamMemberId } : {}),
      });
      setDispatch((current) => ({ ...current, currentRequest: response.request }));
    } catch (requestError) { setError(requestError.message ?? `Nao foi possivel chamar ${serviceName.toLowerCase()}.`); }
    finally { setSaving(false); }
  }

  async function cancel() {
    if (!dispatch.currentRequest || saving) return;
    setSaving(true);
    try { await cancelCourierRequest(session.accessToken, dispatch.currentRequest.id); await load({ silent: true }); }
    catch (requestError) { setError(requestError.message ?? "Nao foi possivel cancelar a chamada."); }
    finally { setSaving(false); }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader eyebrow="Corridas da loja" subtitle="Escolha o tipo, informe a rota e chame a equipe ou todos os profissionais online." title={`Chamar ${serviceName.toLowerCase()}`} />
      <View style={styles.storeCard}><View style={styles.icon}><Ionicons color={colors.primaryDark} name="storefront-outline" size={21} /></View><View style={styles.copy}><Text style={styles.label}>RETIRADA</Text><Text style={styles.storeName}>{store?.name}</Text></View><Pressable onPress={() => navigation.navigate("StoreCourierTeam", { store })} style={styles.teamLink}><Ionicons color={colors.primaryDark} name="people-outline" size={16} /><Text style={styles.teamLinkText}>Equipe</Text></Pressable></View>

      {dispatch.serviceTypes.length > 1 && !dispatch.currentRequest ? (
        <View style={styles.section}>
          <SectionTitle subtitle="Cada tipo usa as regras configuradas no painel administrativo" title="Tipo de chamada" />
          <View style={styles.serviceTypes}>
            {dispatch.serviceTypes.map((type) => {
              const active = Number(type.id) === Number(dispatch.serviceType?.id);
              return <Pressable key={type.id} onPress={() => setServiceTypeId(type.id)} style={[styles.serviceTypeCard, active && styles.serviceTypeCardActive]}><View style={[styles.serviceTypeIcon, active && styles.serviceTypeIconActive]}><Ionicons color={active ? colors.card : colors.primaryDark} name={serviceIconName(type.iconName, "navigate-outline")} size={20} /></View><View style={styles.copy}><Text style={[styles.serviceTypeName, active && styles.serviceTypeNameActive]}>{type.name}</Text><Text numberOfLines={2} style={[styles.serviceTypeDescription, active && styles.serviceTypeDescriptionActive]}>{type.description || "Chamada em tempo real"}</Text></View>{active ? <Ionicons color={colors.card} name="checkmark-circle" size={19} /> : null}</Pressable>;
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.formCard}>
        <AppInput icon="location-outline" label="Retirada" onChangeText={setOrigin} value={origin} />
        <View style={styles.destinationField}>
          <AppInput icon="flag-outline" label="Destino" onChangeText={(value) => { if (value.trim().length < 3) setDestinationSelected(false); setDestination(value); }} placeholder="Digite ao menos 3 letras da rua" value={destination} />
          {addressLoading ? <View style={styles.addressLoading}><ActivityIndicator color={colors.primaryDark} size="small" /><Text style={styles.addressLoadingText}>Buscando ruas e bairros...</Text></View> : null}
          {!addressLoading && addressSearched && !addressSuggestions.length && !destinationSelected ? <Text style={styles.addressEmpty}>Nenhum endereco encontrado nessa cidade. Complete o destino manualmente.</Text> : null}
          {addressSuggestions.length ? <View style={styles.suggestions}>{addressSuggestions.map((address, index) => (
            <Pressable
              key={`${address.zipCode}-${address.street}-${index}`}
              onPress={() => {
                setDestination(suggestionLabel(address));
                setDestinationSelected(true);
                setAddressSearched(false);
                setAddressSuggestions([]);
              }}
              style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
            >
              <View style={styles.suggestionIcon}><Ionicons color={colors.primaryDark} name="location-outline" size={17} /></View>
              <View style={styles.copy}><Text style={styles.suggestionStreet}>{address.street || address.district}</Text><Text style={styles.suggestionMeta}>{[address.district, `${address.city}/${address.state}`, address.zipCode].filter(Boolean).join(" · ")}</Text></View>
            </Pressable>
          ))}</View> : null}
        </View>
        <AppInput icon="cube-outline" label="Detalhes" multiline onChangeText={setDescription} placeholder="Pedido, volume ou referencia" value={description} />
      </View>

      {error ? <StatePanel danger icon="alert-circle-outline" text={error} /> : null}
      {loading ? <StatePanel loading text="Preparando chamada..." /> : null}
      {!loading && dispatch.currentRequest ? (
        <View style={styles.waitingCard}>
          <View style={styles.waitingTop}><View style={styles.radar}><ActivityIndicator color={colors.card} /></View><View style={styles.copy}><Text style={styles.waitingTitle}>Aguardando aceite</Text><Text style={styles.waitingText}>{dispatch.currentRequest.type === "EQUIPE" ? `Chamada de ${serviceName} enviada para ${dispatch.currentRequest.targetedCourier?.name}.` : `A chamada de ${serviceName} foi enviada aos profissionais disponiveis.`}</Text></View></View>
          <Text numberOfLines={2} style={styles.route}>{origin} -&gt; {destination}</Text>
          <Pressable disabled={saving} onPress={cancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar chamada</Text></Pressable>
        </View>
      ) : null}

      {!loading && !dispatch.currentRequest ? (
        <>
          {dispatch.team.length ? <View style={styles.section}><SectionTitle subtitle={`Escolha quem esta online para ${serviceName.toLowerCase()}`} title="Equipe credenciada" />{dispatch.team.map((member) => <Pressable disabled={!member.available || saving || !canRequest} key={member.id} onPress={() => callCourier(member.id)} style={[styles.memberCard, !member.available && styles.disabled]}><View style={styles.memberAvatar}><Ionicons color={colors.primaryDark} name={serviceIcon} size={20} /></View><View style={styles.copy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberMeta}>{member.available ? `${member.vehicle} - disponivel` : member.isBusy ? "Em outra corrida" : "Offline agora"}</Text></View><Ionicons color={member.available ? colors.primaryDark : colors.textMuted} name="arrow-forward" size={19} /></Pressable>)}</View> : null}
          <View style={styles.section}><SectionTitle subtitle="A plataforma avisa todos que estao disponiveis na sua cidade" title="Chamada geral" /><View style={styles.platformCard}><View style={styles.platformIcon}><Ionicons color={colors.card} name={serviceIcon} size={25} /></View><View style={styles.copy}><Text style={styles.platformTitle}>Chamar {serviceName.toLowerCase()}</Text><Text style={styles.platformText}>{dispatch.platformAvailable ? "Servico disponivel agora." : "Servico indisponivel agora."}</Text></View><Pressable disabled={!dispatch.platformAvailable || !canRequest || saving} onPress={() => callCourier()} style={[styles.callButton, (!dispatch.platformAvailable || !canRequest) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.card} /> : <Ionicons color={colors.card} name="arrow-forward" size={20} />}</Pressable></View></View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

function SectionTitle({ subtitle, title }) { return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>; }

const styles = StyleSheet.create({
  addressLoading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.sm },
  addressLoadingText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 11 },
  addressEmpty: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, paddingHorizontal: spacing.sm },
  callButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  cancelButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.md, minHeight: 42, justifyContent: "center" },
  cancelText: { color: colors.danger, fontFamily: fonts.bold, fontSize: typography.caption },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl }, copy: { flex: 1, gap: 3, minWidth: 0 }, disabled: { opacity: 0.48 },
  destinationField: { gap: spacing.sm, zIndex: 2 },
  formCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadowSoft },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 42, justifyContent: "center", width: 42 },
  label: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 }, memberAvatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  memberCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  memberMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, memberName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  platformCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  platformIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 48, justifyContent: "center", width: 48 }, platformText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, platformTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  radar: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 }, route: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: typography.caption },
  section: { gap: spacing.sm }, sectionHeading: { gap: 3 }, sectionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  serviceTypeCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 76, padding: spacing.md },
  serviceTypeCardActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  serviceTypeDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  serviceTypeDescriptionActive: { color: "#CDEFE2" },
  serviceTypeIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 42, justifyContent: "center", width: 42 },
  serviceTypeIconActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  serviceTypeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  serviceTypeNameActive: { color: colors.card },
  serviceTypes: { gap: spacing.sm },
  storeCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md }, storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  suggestion: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34 },
  suggestionMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10 },
  suggestionPressed: { backgroundColor: colors.primarySoft },
  suggestions: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  suggestionStreet: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  teamLink: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 8 }, teamLinkText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  waitingCard: { backgroundColor: "#073E31", borderRadius: radius.lg, gap: spacing.md, padding: spacing.lg, ...shadowSoft }, waitingText: { color: "#CDEFE2", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 }, waitingTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3 }, waitingTop: { alignItems: "center", flexDirection: "row", gap: spacing.md },
});
