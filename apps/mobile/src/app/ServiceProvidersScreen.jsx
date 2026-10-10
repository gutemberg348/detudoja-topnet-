import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AccountAddressRequirementModal } from "../components/AccountAddressRequirementModal";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { ServiceCashbackNotice } from "../components/ServiceCashbackNotice";
import { StatePanel } from "../components/StatePanel";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { ApiError } from "../services/api";
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
import { formatarDinheiro } from "../utils/money";
import { serviceIconName } from "../utils/service-icons";
import { getCurrentUserAddresses } from "../services/users.api";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

export function ServiceProvidersScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const segment = route.params?.serviceType ?? route.params?.segment;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [activeCourierConversation, setActiveCourierConversation] =
    useState(null);
  const [addressRequirementOpen, setAddressRequirementOpen] = useState(false);
  const [courierAvailable, setCourierAvailable] = useState(false);
  const [courierRequest, setCourierRequest] = useState(null);
  const [serviceLocation, setServiceLocation] = useState(null);
  const [sellers, setSellers] = useState([]);
  const courierPulse = useRef(new Animated.Value(0)).current;
  const loadSequenceRef = useRef(0);
  const isCourier = segment?.operationalType === "ENTREGA_LOCAL";
  const isFixedPrice = segment?.mode === "PRECO_FIXO";
  const serviceName = segment?.name ?? "Servico";
  const serviceNameLower = serviceName.toLocaleLowerCase("pt-BR");
  const serviceIcon = serviceIconName(segment?.iconName, "navigate-outline");
  const cityLabel = serviceLocation?.city
    ? `${serviceLocation.city}${serviceLocation.state ? ` - ${serviceLocation.state}` : ""}`
    : "sua cidade";

  useEffect(() => {
    if (!isCourier || !session?.accessToken) return undefined;
    let active = true;
    getCurrentUserAddresses(session.accessToken).then((response) => {
      if (!active) return;
      const address = (response.addresses ?? []).find((item) => item.cidade && item.estado);
      setServiceLocation(response.marketplaceLocation ?? (address
        ? { city: address.cidade, state: address.estado }
        : null));
    }).catch(() => {});
    return () => { active = false; };
  }, [isCourier, session?.accessToken]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!session?.accessToken || !segment?.id) return;
      const sequence = ++loadSequenceRef.current;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const [providersResponse, requestsResponse, conversationsResponse] =
          await Promise.all([
            getOnlineServiceProviders(session.accessToken, segment.id),
            isCourier
              ? getCustomerCourierRequests(session.accessToken, segment.id)
              : Promise.resolve({ requests: [] }),
            isCourier
              ? getServiceConversations(session.accessToken)
              : Promise.resolve({ conversations: [] }),
          ]);
        if (sequence !== loadSequenceRef.current) return;
        const activeConversation = (
          conversationsResponse.conversations ?? []
        ).find(
          (conversation) =>
            !conversation.isSeller &&
            Number(conversation.serviceType?.id) === Number(segment.id) &&
            ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(
              conversation.status,
            ),
        );
        setActiveCourierConversation(activeConversation ?? null);
        setCourierAvailable(
          Boolean(providersResponse.serviceType?.availableNow),
        );
        setCourierRequest(requestsResponse.requests?.[0] ?? null);
        setSellers(isCourier ? [] : (providersResponse.sellers ?? []));
      } catch (requestError) {
        if (!silent && sequence === loadSequenceRef.current)
          setError(
            requestError.message ?? "Nao foi possivel buscar prestadores.",
          );
      } finally {
        if (sequence === loadSequenceRef.current) setLoading(false);
      }
    },
    [isCourier, segment?.id, session?.accessToken],
  );

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh({
    accessToken: session?.accessToken, enabled: Boolean(segment?.id), scopeKey: segment?.id,
    events: [realtimeEvents.serviceAvailabilityUpdated, realtimeEvents.serviceChatCreated,
      realtimeEvents.serviceChatMessageCreated, realtimeEvents.serviceChatUpdated],
    onRefresh: () => load({ silent: true }),
  });

  useEffect(() => {
    const isSearching =
      isCourier &&
      (openingId === "courier" || courierRequest?.status === "PENDENTE");
    if (!isSearching) {
      courierPulse.stopAnimation();
      courierPulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.timing(courierPulse, {
        duration: 1800,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [courierPulse, courierRequest?.status, isCourier, openingId]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const handleCourierUpdate = async ({ request } = {}) => {
      if (
        !isCourier ||
        Number(request?.serviceType?.id) !== Number(segment?.id)
      )
        return;
      if (Number(request.requesterUserId) !== Number(session.user?.id)) return;
      setCourierRequest(
        request.status === "PENDENTE" || request.status === "ACEITA"
          ? request
          : null,
      );
      if (request.status === "ACEITA" && request.conversationId) {
        try {
          const response = await getServiceConversation(
            session.accessToken,
            request.conversationId,
          );
          navigation.replace("ServiceConversation", {
            conversation: response.conversation,
          });
        } catch {
          load({ silent: true });
        }
      }
    };
    socket?.on(realtimeEvents.courierRequestUpdated, handleCourierUpdate);
    return () => {
      socket?.off(realtimeEvents.courierRequestUpdated, handleCourierUpdate);
    };
  }, [
    isCourier,
    load,
    navigation,
    segment?.id,
    session?.accessToken,
    session?.user?.id,
  ]);

  useEffect(() => {
    if (
      !isCourier ||
      courierRequest?.status !== "ACEITA" ||
      !courierRequest.conversationId ||
      !session?.accessToken
    )
      return;
    let active = true;
    getServiceConversation(session.accessToken, courierRequest.conversationId)
      .then((response) => {
        if (active)
          navigation.replace("ServiceConversation", {
            conversation: response.conversation,
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    courierRequest?.conversationId,
    courierRequest?.status,
    isCourier,
    navigation,
    session?.accessToken,
  ]);

  async function openConversation(seller) {
    if (openingId || !session?.accessToken) return;
    setOpeningId(seller.id);
    setError("");
    try {
      const response = await createServiceConversation(session.accessToken, {
        description: isCourier ? "Quero combinar uma entrega." : "",
        sellerServiceId: seller.sellerServiceId,
      });
      navigation.navigate("ServiceConversation", {
        conversation: response.conversation,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel iniciar a conversa.");
    } finally {
      setOpeningId(null);
    }
  }

  async function callCourier() {
    if (!session?.accessToken || openingId || courierRequest) return;
    setOpeningId("courier");
    setError("");
    try {
      const response = await createCustomerCourierRequest(session.accessToken, {
        description: `Quero solicitar ${serviceNameLower}.`,
        serviceTypeId: segment.id,
      });
      setCourierRequest(response.request);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 428) {
        setAddressRequirementOpen(true);
      } else {
        setError(requestError.message ?? `Nao foi possivel chamar ${serviceNameLower}.`);
      }
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
      {isCourier ? (
        <View style={styles.courierHero}>
          <View style={styles.courierCity}>
            <Ionicons color="#C7F5DC" name="location-outline" size={16} />
            <Text numberOfLines={1} style={styles.courierCityText}>{cityLabel}</Text>
          </View>
          <View style={styles.courierHeroBody}>
            <View style={styles.courierHeroIcon}>
              <Ionicons color={colors.primaryDark} name={serviceIcon} size={29} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.courierHeroEyebrow}>CHAMADA NA SUA CIDADE</Text>
              <Text style={styles.courierHeroTitle}>Chamar {serviceNameLower}</Text>
            </View>
          </View>
          <Text style={styles.courierHeroText}>
            Enviamos sua chamada aos profissionais livres. Quem aceitar abre um chat para combinar os detalhes com voce.
          </Text>
        </View>
      ) : (
        <PageHeader
          eyebrow="Negociacao por chat"
          subtitle="Escolha quem esta atendendo agora. Combine detalhes, fotos e valor na conversa."
          title={`${serviceName} online`}
        />
      )}

      <ServiceCashbackNotice />

      {isCourier ? (
        <View style={styles.courierSafety}>
          <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={19} />
          <Text style={styles.courierSafetyText}>Voce ve quem aceitou antes de combinar o atendimento no chat.</Text>
        </View>
      ) : null}

      {loading ? (
        <StatePanel
          icon="chatbubbles-outline"
          loading
          text="Buscando quem esta online..."
        />
      ) : null}
      {!loading && error ? (
        <StatePanel
          actionLabel="Tentar de novo"
          danger
          icon="alert-circle-outline"
          onAction={load}
          text={error}
        />
      ) : null}
      {!loading && !error && isCourier && activeCourierConversation ? (
        <Pressable
          onPress={() =>
            navigation.navigate("ServiceConversation", {
              conversation: activeCourierConversation,
            })
          }
          style={({ pressed }) => [
            styles.activeChatCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.activeChatIcon}>
            <Ionicons
              color={colors.card}
              name="chatbubbles-outline"
              size={22}
            />
          </View>
          <View style={styles.copy}>
            <Text style={styles.availabilityLabel}>
              ATENDIMENTO EM ANDAMENTO
            </Text>
            <Text style={styles.availabilityTitle}>Voltar para o chat</Text>
            <Text numberOfLines={1} style={styles.availabilityText}>
              Continue combinando retirada, destino e pagamento.
            </Text>
          </View>
          {activeCourierConversation.unreadCount ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {activeCourierConversation.unreadCount}
              </Text>
            </View>
          ) : null}
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={19} />
        </Pressable>
      ) : null}
      {!loading &&
      !error &&
      isCourier &&
      !activeCourierConversation &&
      courierRequest?.status === "PENDENTE" ? (
        <View style={styles.waitingCard}>
          <View style={styles.waitingStatusLine}>
            <Animated.View
              style={[
                styles.waitingLiveDot,
                {
                  opacity: courierPulse.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.45, 1, 0.45],
                  }),
                },
              ]}
            />
            <Text style={styles.waitingStatusText}>CHAMADA ATIVA</Text>
          </View>
          <View style={styles.waitingRadarWrap}>
            <Animated.View
              style={[
                styles.waitingPulse,
                {
                  opacity: courierPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.38, 0],
                  }),
                  transform: [
                    {
                      scale: courierPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.72, 1.9],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.waitingOrbit,
                {
                  transform: [{
                    rotate: courierPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  }],
                },
              ]}
            >
              <View style={styles.waitingOrbitDot} />
            </Animated.View>
            <Animated.View
              style={[
                styles.waitingPulse,
                styles.waitingPulseSecondary,
                {
                  opacity: courierPulse.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 0.28, 0],
                  }),
                  transform: [
                    {
                      scale: courierPulse.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1.38, 0.72, 1.38],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.waitingRadar,
                {
                  transform: [
                    {
                      translateY: courierPulse.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, -3, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Ionicons color={colors.card} name={serviceIcon} size={27} />
            </Animated.View>
          </View>
          <Text style={styles.waitingTitle}>{courierRequest?.isDirect ? "Aguardando este motoboy" : `Procurando ${serviceNameLower}`}</Text>
          <Text style={styles.waitingText}>
            {courierRequest?.isDirect
              ? `A chamada foi enviada somente para ${courierRequest.targetedCourier?.name ?? "este profissional"}. O chat abre quando ele aceitar.`
              : "Estamos avisando os profissionais livres da sua cidade. Voce entra no chat assim que alguem aceitar."}
          </Text>
          <View style={styles.waitingTimeline}>
            <WaitingStage done icon="checkmark" label="Chamada enviada" />
            <View style={styles.waitingTimelineLine} />
            <WaitingStage active icon="notifications-outline" label="Avisando profissionais" pulse={courierPulse} />
            <View style={styles.waitingTimelineLine} />
            <WaitingStage icon="chatbubble-outline" label="Chat liberado" />
          </View>
          <Pressable
            disabled={openingId === "cancel"}
            onPress={cancelCourierCall}
            style={({ pressed }) => [
              styles.waitingCancel,
              pressed && styles.pressed,
            ]}
          >
            {openingId === "cancel" ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Ionicons color={colors.danger} name="close-circle-outline" size={18} />
            )}
            <Text style={styles.waitingCancelText}>Cancelar chamada</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading &&
      !error &&
      isCourier &&
      !activeCourierConversation &&
      !courierRequest ? (
        <View style={styles.courierActionArea}>
          <View
            style={[
              styles.availabilityCard,
              !courierAvailable && styles.availabilityCardOff,
            ]}
          >
            <View
              style={[
                styles.availabilityIcon,
                !courierAvailable && styles.availabilityIconOff,
              ]}
            >
              <Ionicons
                color={courierAvailable ? colors.card : colors.textMuted}
                name={serviceIcon}
                size={26}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.availabilityLabel}>
                {courierAvailable
                  ? `DISPONIVEL EM ${cityLabel.toLocaleUpperCase("pt-BR")}`
                  : "AGUARDANDO PROFISSIONAIS"}
              </Text>
              <Text style={styles.availabilityTitle}>
                {courierAvailable
                  ? `${serviceName} perto de voce`
                  : `Nenhum profissional de ${serviceNameLower} livre agora`}
              </Text>
              <Text style={styles.availabilityText}>
                {courierAvailable
                  ? "A chamada vai para quem esta online na sua cidade."
                  : "A disponibilidade e atualizada automaticamente."}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel={`Chamar ${serviceNameLower} em ${cityLabel}`}
            disabled={!courierAvailable}
            onPress={callCourier}
            style={({ pressed }) => [
              styles.courierCallAction,
              !courierAvailable && styles.courierCallActionDisabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.courierCallIcon}>
              {openingId === "courier" ? <ActivityIndicator color={colors.card} /> : <Ionicons color={colors.card} name={serviceIcon} size={24} />}
            </View>
            <View style={styles.copy}>
              <Text style={styles.courierCallTitle}>Chamar {serviceNameLower}</Text>
              <Text numberOfLines={1} style={styles.courierCallSubtitle}>Encontrar profissional em {cityLabel}</Text>
            </View>
            <Ionicons color={colors.card} name="arrow-forward" size={22} />
          </Pressable>
        </View>
      ) : null}
      {!loading && !isCourier && !error && sellers.length ? (
        <View style={styles.providerSection}>
          <View style={styles.providerSectionHeader}>
            <View style={styles.providerSectionIcon}>
              <Ionicons color={colors.primaryDark} name="people-outline" size={19} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.providerSectionTitle}>Escolha quem vai atender</Text>
              <Text style={styles.providerSectionText}>{isFixedPrice ? "Compare os valores. O preco escolhido entra automaticamente no atendimento." : "Toque em um profissional para abrir a conversa."}</Text>
            </View>
          </View>
          <View style={styles.list}>
            {sellers.map((seller) => (
              <ProviderCard
                isCourier={isCourier}
                isFixedPrice={isFixedPrice}
                key={seller.id}
                loading={openingId === seller.id}
                onPress={() => openConversation(seller)}
                seller={seller}
              />
            ))}
          </View>
        </View>
      ) : null}
      {!loading && !isCourier && !error && !sellers.length ? (
        <StatePanel
          icon="time-outline"
          text={`Quando um prestador de ${segment?.name ?? "servicos"} ativar o atendimento, ele aparece aqui.`}
          title="Ninguem online agora"
        />
      ) : null}
      <AccountAddressRequirementModal
        onClose={() => setAddressRequirementOpen(false)}
        onCompleted={() => {
          setAddressRequirementOpen(false);
          setTimeout(() => callCourier(), 0);
        }}
        open={addressRequirementOpen}
        reason={`localizar profissionais de ${serviceNameLower} disponiveis na sua cidade`}
      />
    </ScreenContainer>
  );
}

function WaitingStage({ active = false, done = false, icon, label, pulse }) {
  const animatedStyle = active && pulse
    ? {
        opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.65, 1, 0.65] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.96, 1.05, 0.96] }) }],
      }
    : null;
  return (
    <View style={styles.waitingStage}>
      <Animated.View style={[styles.waitingStageIcon, (active || done) && styles.waitingStageIconActive, animatedStyle]}>
        <Ionicons color={active || done ? colors.card : colors.textMuted} name={icon} size={14} />
      </Animated.View>
      <Text style={[styles.waitingStageText, (active || done) && styles.waitingStageTextActive]}>{label}</Text>
    </View>
  );
}

function ProviderCard({ isCourier, isFixedPrice, loading, onPress, seller }) {
  const courier = seller.courierProfile;
  const displayName = courier?.displayName ?? seller.name;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isCourier && styles.courierCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTopline}>
        <View style={styles.avatar}>
          {seller.photoUrl ? (
            <Image
              source={{ uri: resolveMediaUrl(seller.photoUrl) }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>{displayName?.[0] ?? "P"}</Text>
          )}
        </View>
        <View style={styles.copy}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.name}>
              {displayName}
            </Text>
            <View style={styles.online}>
              <View style={styles.dot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          </View>
          <Text numberOfLines={2} style={styles.description}>
            {isCourier && courier
              ? `${courier.vehicleModel}${courier.color ? ` - ${courier.color}` : ""}`
              : seller.description ||
                "Disponivel para combinar seu atendimento."}
          </Text>
        </View>
      </View>

      {isCourier && courier ? (
        <View style={styles.facts}>
          <ProviderFact
            icon="navigate-outline"
            text={`Ate ${courier.serviceRadiusKm} km`}
          />
          <ProviderFact
            icon="star"
            text={courier.rating ? courier.rating.toFixed(1) : "Novo"}
          />
          <ProviderFact
            icon="checkmark-done-outline"
            text={`${courier.totalDeliveries} entregas`}
          />
        </View>
      ) : (
        <View style={styles.providerFactsRow}>
          <Text style={styles.rating}>
            <Ionicons color={colors.warning} name="star" size={13} />{" "}
            {seller.rating ? seller.rating.toFixed(1) : "Novo prestador"}
          </Text>
          {isFixedPrice && seller.priceCents ? (
            <View style={styles.fixedPricePill}>
              <Text style={styles.fixedPriceLabel}>PRECO FIXO</Text>
              <Text style={styles.fixedPriceValue}>{formatarDinheiro(seller.priceCents)}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.cardAction}>
        <Text style={styles.cardActionText}>
          {isCourier ? "Chamar corrida" : isFixedPrice && seller.priceCents ? `Contratar por ${formatarDinheiro(seller.priceCents)}` : "Abrir conversa"}
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.primaryDark} size="small" />
        ) : (
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={18} />
        )}
      </View>
    </Pressable>
  );
}

function ProviderFact({ icon, text }) {
  return (
    <View style={styles.fact}>
      <Ionicons color={colors.primaryDark} name={icon} size={14} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activeChatCard: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    ...shadowSoft,
  },
  activeChatIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  availabilityCard: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    ...shadowSoft,
  },
  availabilityCardOff: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  availabilityIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  availabilityLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  availabilityText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  availabilityTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 52,
    justifyContent: "center",
    overflow: "hidden",
    width: 52,
  },
  avatarImage: { height: "100%", width: "100%" },
  avatarText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 92,
    padding: spacing.md,
  },
  cardAction: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
    paddingTop: spacing.sm,
  },
  cardActionText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
  },
  cardTopline: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  copy: { flex: 1, gap: 5, minWidth: 0 },
  courierCard: { borderColor: colors.primaryLight, ...shadowSoft },
  courierActionArea: { gap: spacing.md },
  courierCallAction: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, minHeight: 82, paddingHorizontal: spacing.lg, ...shadowSoft },
  courierCallActionDisabled: { backgroundColor: colors.textMuted },
  courierCallIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.17)", borderRadius: radius.round, height: 46, justifyContent: "center", width: 46 },
  courierCallTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.label },
  courierCallSubtitle: { color: "#D1FAE5", fontFamily: fonts.medium, fontSize: typography.caption },
  courierHero: { backgroundColor: "#073F32", borderRadius: 26, gap: spacing.lg, overflow: "hidden", padding: spacing.xl, ...shadowSoft },
  courierHeroBody: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  courierHeroIcon: { alignItems: "center", backgroundColor: "#E7FFF2", borderRadius: radius.lg, height: 56, justifyContent: "center", width: 56 },
  courierHeroEyebrow: { color: "#B7E9D1", fontFamily: fonts.bold, fontSize: 10 },
  courierHeroTitle: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h2 },
  courierHeroText: { color: "#D4F2E5", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 20 },
  courierCity: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.13)", borderRadius: radius.round, flexDirection: "row", gap: 6, maxWidth: "100%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  courierCityText: { color: colors.card, fontFamily: fonts.bold, fontSize: typography.caption },
  courierSafety: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.xs },
  courierSafetyText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.caption, lineHeight: 18 },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  dot: {
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 6,
    width: 6,
  },
  fact: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  factText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  fixedPriceLabel: { color: colors.textMuted, fontFamily: fonts.extraBold, fontSize: 8 },
  fixedPricePill: { alignItems: "flex-end", backgroundColor: colors.primarySoft, borderRadius: radius.md, gap: 1, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  fixedPriceValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.small },
  list: { gap: spacing.sm },
  providerSection: { gap: spacing.md },
  providerSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  providerSectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  providerSectionText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  providerSectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
  name: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
  },
  nameLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  online: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  onlineText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  pressed: { opacity: 0.8 },
  rating: {
    alignItems: "center",
    color: colors.textMuted,
    flexDirection: "row",
    fontFamily: fonts.medium,
    fontSize: 11,
    gap: 3,
  },
  providerFactsRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  waitingCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
    ...shadowSoft,
  },
  waitingCancel: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.dangerSoft,
    borderColor: "#FECACA",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.sm,
    minHeight: 48,
  },
  waitingCancelText: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: typography.small,
  },
  waitingLiveDot: {
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 7,
    width: 7,
  },
  waitingOrbit: { alignItems: "center", height: 98, position: "absolute", width: 98 },
  waitingOrbitDot: { backgroundColor: colors.success, borderColor: colors.card, borderRadius: radius.round, borderWidth: 2, height: 12, width: 12 },
  waitingRadar: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 4,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  waitingRadarWrap: {
    alignItems: "center",
    height: 104,
    justifyContent: "center",
    width: 104,
  },
  waitingPulse: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.round,
    height: 72,
    position: "absolute",
    width: 72,
  },
  waitingPulseSecondary: { backgroundColor: "#A7F3D0" },
  waitingStatusLine: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  waitingStatusText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  waitingStage: { alignItems: "center", flex: 1, gap: 5 },
  waitingStageIcon: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, height: 30, justifyContent: "center", width: 30 },
  waitingStageIconActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  waitingStageText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 8, textAlign: "center" },
  waitingStageTextActive: { color: colors.primaryDark, fontFamily: fonts.bold },
  waitingTimeline: { alignItems: "flex-start", alignSelf: "stretch", flexDirection: "row", marginTop: spacing.sm },
  waitingTimelineLine: { backgroundColor: colors.primaryLight, height: 2, marginHorizontal: -8, marginTop: 14, width: 34 },
  waitingText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "center",
  },
  waitingTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
  },
  unreadBadge: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderRadius: radius.round,
    height: 24,
    justifyContent: "center",
    minWidth: 24,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#4A2B00",
    fontFamily: fonts.extraBold,
    fontSize: 10,
  },
});
