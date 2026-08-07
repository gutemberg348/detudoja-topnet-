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
import { useAuthStore } from "../stores/useAuthStore";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

function storeAddress(store) {
  const address = store?.address;
  return [address?.street, address?.number, address?.district, address?.city, address?.state].filter(Boolean).join(", ");
}

export function StoreCourierRequestScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const store = route.params?.store;
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState("");
  const [dispatch, setDispatch] = useState({ currentRequest: null, platformAvailable: false, team: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState(() => storeAddress(store));
  const [saving, setSaving] = useState(false);
  const canRequest = useMemo(() => origin.trim().length >= 5 && destination.trim().length >= 5, [destination, origin]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !store?.id) return;
    if (!silent) setLoading(true);
    try { setDispatch(await getStoreCourierDispatch(session.accessToken, store.id)); }
    catch (requestError) { if (!silent) setError(requestError.message ?? "Nao foi possivel preparar a entrega."); }
    finally { if (!silent) setLoading(false); }
  }, [session?.accessToken, store?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const expiresAt = dispatch.currentRequest?.expiresAt;
    if (!expiresAt) return undefined;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now()) + 250;
    const timeout = setTimeout(() => load({ silent: true }), delay);
    return () => clearTimeout(timeout);
  }, [dispatch.currentRequest?.expiresAt, load]);
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
    if (!canRequest || saving) return;
    setSaving(true); setError("");
    try {
      const response = await createStoreCourierRequest(session.accessToken, store.id, {
        description,
        destination,
        origin,
        ...(route.params?.orderId ? { orderId: route.params.orderId } : {}),
        ...(teamMemberId ? { teamMemberId } : {}),
      });
      setDispatch((current) => ({ ...current, currentRequest: response.request }));
    } catch (requestError) { setError(requestError.message ?? "Nao foi possivel chamar o motoboy."); }
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
      <PageHeader eyebrow="Entrega da loja" subtitle="Informe a rota. A conversa abre somente quando um motoboy aceitar." title="Chamar motoboy" />
      <View style={styles.storeCard}><View style={styles.icon}><Ionicons color={colors.primaryDark} name="storefront-outline" size={21} /></View><View style={styles.copy}><Text style={styles.label}>RETIRADA</Text><Text style={styles.storeName}>{store?.name}</Text></View><Pressable onPress={() => navigation.navigate("StoreCourierTeam", { store })} style={styles.teamLink}><Ionicons color={colors.primaryDark} name="people-outline" size={16} /><Text style={styles.teamLinkText}>Equipe</Text></Pressable></View>

      <View style={styles.formCard}>
        <AppInput icon="location-outline" label="Retirada" onChangeText={setOrigin} value={origin} />
        <AppInput icon="flag-outline" label="Destino" onChangeText={setDestination} placeholder="Endereco completo da entrega" value={destination} />
        <AppInput icon="cube-outline" label="Detalhes" multiline onChangeText={setDescription} placeholder="Pedido, volume ou referencia" value={description} />
      </View>

      {error ? <StatePanel danger icon="alert-circle-outline" text={error} /> : null}
      {loading ? <StatePanel loading text="Preparando chamada..." /> : null}
      {!loading && dispatch.currentRequest ? (
        <View style={styles.waitingCard}>
          <View style={styles.waitingTop}><View style={styles.radar}><ActivityIndicator color={colors.card} /></View><View style={styles.copy}><Text style={styles.waitingTitle}>Aguardando aceite</Text><Text style={styles.waitingText}>{dispatch.currentRequest.type === "EQUIPE" ? `Chamada enviada para ${dispatch.currentRequest.targetedCourier?.name}.` : "A chamada foi enviada aos motoboys disponiveis."}</Text></View></View>
          <Text numberOfLines={2} style={styles.route}>{origin} -&gt; {destination}</Text>
          <Pressable disabled={saving} onPress={cancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar chamada</Text></Pressable>
        </View>
      ) : null}

      {!loading && !dispatch.currentRequest ? (
        <>
          {dispatch.team.length ? <View style={styles.section}><SectionTitle subtitle="Chamada reservada para quem trabalha com sua loja" title="Motoboys cadastrados" />{dispatch.team.map((member) => <Pressable disabled={!member.isOnline || saving || !canRequest} key={member.id} onPress={() => callCourier(member.id)} style={[styles.memberCard, !member.isOnline && styles.disabled]}><View style={styles.memberAvatar}><Ionicons color={colors.primaryDark} name="bicycle-outline" size={20} /></View><View style={styles.copy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberMeta}>{member.isOnline ? `${member.vehicle} - disponivel` : "Offline agora"}</Text></View><Ionicons color={member.isOnline ? colors.primaryDark : colors.textMuted} name="arrow-forward" size={19} /></Pressable>)}</View> : null}
          <View style={styles.section}><SectionTitle subtitle="O primeiro profissional da plataforma que aceitar assume a corrida" title="Chamada geral" /><View style={styles.platformCard}><View style={styles.platformIcon}><Ionicons color={colors.card} name="radio-outline" size={25} /></View><View style={styles.copy}><Text style={styles.platformTitle}>Chamar motoboy</Text><Text style={styles.platformText}>{dispatch.platformAvailable ? "Ha cobertura para sua loja agora." : "Sem cobertura neste momento."}</Text></View><Pressable disabled={!dispatch.platformAvailable || !canRequest || saving} onPress={() => callCourier()} style={[styles.callButton, (!dispatch.platformAvailable || !canRequest) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.card} /> : <Ionicons color={colors.card} name="arrow-forward" size={20} />}</Pressable></View></View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

function SectionTitle({ subtitle, title }) { return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>; }

const styles = StyleSheet.create({
  callButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  cancelButton: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.md, minHeight: 42, justifyContent: "center" },
  cancelText: { color: colors.danger, fontFamily: fonts.bold, fontSize: typography.caption },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl }, copy: { flex: 1, gap: 3, minWidth: 0 }, disabled: { opacity: 0.48 },
  formCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadowSoft },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 42, justifyContent: "center", width: 42 },
  label: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 }, memberAvatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  memberCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  memberMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, memberName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  platformCard: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  platformIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 48, justifyContent: "center", width: 48 }, platformText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, platformTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  radar: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 }, route: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: typography.caption },
  section: { gap: spacing.sm }, sectionHeading: { gap: 3 }, sectionSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, sectionTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  storeCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md }, storeName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  teamLink: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 8 }, teamLinkText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  waitingCard: { backgroundColor: "#073E31", borderRadius: radius.lg, gap: spacing.md, padding: spacing.lg, ...shadowSoft }, waitingText: { color: "#CDEFE2", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 }, waitingTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h3 }, waitingTop: { alignItems: "center", flexDirection: "row", gap: spacing.md },
});
