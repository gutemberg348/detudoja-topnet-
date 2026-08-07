import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { createServiceConversation, getOnlineServiceProviders } from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function ServiceProvidersScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const segment = route.params?.serviceType ?? route.params?.segment;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [sellers, setSellers] = useState([]);
  const isCourier = segment?.operationalType === "ENTREGA_LOCAL";

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken || !segment?.id) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try { const response = await getOnlineServiceProviders(session.accessToken, segment.id); setSellers(response.sellers ?? []); }
    catch (requestError) { if (!silent) setError(requestError.message ?? "Nao foi possivel buscar prestadores."); }
    finally { if (!silent) setLoading(false); }
  }, [segment?.id, session?.accessToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refreshProviders = (payload = {}) => {
      if (Number(payload.serviceTypeId) === Number(segment?.id)) {
        load({ silent: true });
      }
    };
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refreshProviders);
    return () => socket?.off(realtimeEvents.serviceAvailabilityUpdated, refreshProviders);
  }, [load, segment?.id, session?.accessToken]);

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

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader
        eyebrow={isCourier ? "Entrega em tempo real" : "Negociacao por chat"}
        subtitle={isCourier
          ? "Escolha um motoboy disponivel e combine retirada, destino e valor pelo chat."
          : "Escolha quem esta atendendo agora. Combine detalhes, fotos e valor na conversa."}
        title={`${segment?.name ?? "Servico"} online`}
      />

      {isCourier ? (
        <View style={styles.courierNotice}>
          <View style={styles.noticeIcon}><Ionicons color={colors.card} name="shield-checkmark-outline" size={19} /></View>
          <View style={styles.copy}>
            <Text style={styles.noticeTitle}>Perfis de entrega identificados</Text>
            <Text style={styles.noticeText}>Veiculo e raio de atendimento ficam visiveis antes de voce chamar.</Text>
          </View>
        </View>
      ) : null}

      {loading ? <StatePanel icon="chatbubbles-outline" loading text="Buscando quem esta online..." /> : null}
      {!loading && error ? <StatePanel actionLabel="Tentar de novo" danger icon="alert-circle-outline" onAction={load} text={error} /> : null}
      {!loading && !error && sellers.length ? (
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
      {!loading && !error && !sellers.length ? (
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
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 52, justifyContent: "center", overflow: "hidden", width: 52 },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, minHeight: 92, padding: spacing.md },
  cardAction: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 34, paddingTop: spacing.sm },
  cardActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
  cardTopline: { alignItems: "center", flexDirection: "row", gap: spacing.md },
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
});
