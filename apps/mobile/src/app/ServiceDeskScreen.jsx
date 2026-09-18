import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, Vibration, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatePanel } from "../components/StatePanel";
import {
  acceptCourierRequest,
  getCourierRequests,
  saveCourierProfile,
  updateCourierDispatchScope,
} from "../services/courier.api";
import { getSellerProfile } from "../services/seller.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  getServiceConversation,
  getSellerServices,
  getServiceConversations,
  registerSellerService,
  updateSellerService,
} from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { getCurrentUserAddresses, updateCurrentUser } from "../services/users.api";
import { serviceIconName } from "../utils/service-icons";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";
import { CourierRegistrationModal } from "./service/CourierRegistrationModal";
import { RegisterServiceModal } from "./service/RegisterServiceModal";

function serviceIcon(iconName) {
  return serviceIconName(iconName);
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
  const [accountAddress, setAccountAddress] = useState(null);
  const [courierRequests, setCourierRequests] = useState([]);
  const [courierError, setCourierError] = useState("");
  const [courierDashboard, setCourierDashboard] = useState(null);
  const [courierModalOpen, setCourierModalOpen] = useState(false);
  const [courierProfile, setCourierProfile] = useState(null);
  const [courierSaving, setCourierSaving] = useState(false);
  const [courierScopeSaving, setCourierScopeSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [registeringService, setRegisteringService] = useState(false);
  const [registerServiceError, setRegisterServiceError] = useState("");
  const [registerServiceOpen, setRegisterServiceOpen] = useState(false);
  const [pendingCourierService, setPendingCourierService] = useState(null);
  const [savingServiceId, setSavingServiceId] = useState(null);
  const [acceptingRequestId, setAcceptingRequestId] = useState(null);
  const [services, setServices] = useState([]);

  const activeServices = useMemo(
    () => services.filter((service) => service.available),
    [services],
  );
  const catalogServices = useMemo(
    () => services.filter((service) => !service.enabled),
    [services],
  );
  const registeredServices = useMemo(
    () => services.filter((service) => service.enabled),
    [services],
  );
  const courierRegisteredServices = useMemo(
    () => registeredServices.filter((service) => service.requiresCourierProfile),
    [registeredServices],
  );
  const otherRegisteredServices = useMemo(
    () => registeredServices.filter((service) => !service.requiresCourierProfile),
    [registeredServices],
  );
  const courierConversations = useMemo(
    () => conversations.filter((conversation) => (
      conversation.serviceType?.operationalType === "ENTREGA_LOCAL"
    )),
    [conversations],
  );
  const courierCalls = useMemo(
    () => courierConversations.filter((conversation) => (
      ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)
    )),
    [courierConversations],
  );
  const openCalls = useMemo(
    () => conversations.filter((conversation) => (
      conversation.serviceType?.operationalType !== "ENTREGA_LOCAL"
      && ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)
    )),
    [conversations],
  );
  const courierService = useMemo(
    () => services.find((service) => service.requiresCourierProfile),
    [services],
  );
  const receivesPlatformCalls = Boolean(
    courierProfile && (courierProfile.acceptsPlatformCalls || !courierProfile.linkedStoreCount),
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const [profileResponse, servicesResponse, conversationsResponse, requestsResponse, addressesResponse] = await Promise.all([
        getSellerProfile(session.accessToken),
        getSellerServices(session.accessToken),
        getServiceConversations(session.accessToken),
        getCourierRequests(session.accessToken),
        getCurrentUserAddresses(session.accessToken),
      ]);
      setProfile(profileResponse.profile ?? null);
      setCourierProfile(servicesResponse.courierProfile ?? null);
      setServices(servicesResponse.services ?? []);
      setConversations((conversationsResponse.conversations ?? []).filter((conversation) => conversation.isSeller));
      setCourierRequests(requestsResponse.requests ?? []);
      setCourierDashboard(requestsResponse.dashboard ?? null);
      setAccountAddress(addressesResponse.addresses?.[0] ?? null);
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
    if (!courierRequests.length || Platform.OS === "web") return undefined;
    Vibration.vibrate([0, 180, 110, 220]);
    const timer = setInterval(() => Vibration.vibrate([0, 180, 110, 220]), 8000);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [courierRequests.length]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => load({ silent: true });
    const notifyCourier = () => load({ silent: true });
    socket?.on(realtimeEvents.serviceChatCreated, refresh);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refresh);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refresh);
    socket?.on(realtimeEvents.serviceChatUpdated, refresh);
    socket?.on(realtimeEvents.courierRequestCreated, notifyCourier);
    socket?.on(realtimeEvents.courierRequestUpdated, refresh);
    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refresh);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refresh);
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refresh);
      socket?.off(realtimeEvents.serviceChatUpdated, refresh);
      socket?.off(realtimeEvents.courierRequestCreated, notifyCourier);
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
      await load({ silent: true });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel atualizar a disponibilidade.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function startService(service) {
    if (!session?.accessToken || savingServiceId) return;
    const requirements = service.registrationRequirements ?? {};
    if (service.requiresCourierProfile || requirements.requiresVehicle || requirements.requiresDriverLicense || requirements.requiresPlate) {
      setPendingCourierService(service);
      setCourierError("");
      setCourierModalOpen(true);
      return;
    }

    setSavingServiceId(service.id);
    setError("");
    try {
      await updateSellerService(session.accessToken, { available: true, serviceTypeId: service.id });
      await load({ silent: true });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cadastrar este servico.");
    } finally {
      setSavingServiceId(null);
    }
  }

  async function submitServiceRegistration(data) {
    if (!session?.accessToken || registeringService) return;
    setRegisteringService(true);
    setRegisterServiceError("");
    try {
      await registerSellerService(session.accessToken, data);
      setRegisterServiceOpen(false);
      await load({ silent: true });
    } catch (requestError) {
      setRegisterServiceError(requestError.message ?? "Nao foi possivel cadastrar este servico.");
    } finally {
      setRegisteringService(false);
    }
  }

  async function submitCourierProfile(data) {
    if (!session?.accessToken || courierSaving) return;
    setCourierSaving(true);
    setCourierError("");

    try {
      const { accountAddress: inlineAddress, ...profileData } = data;
      if (inlineAddress) {
        const addressResponse = await updateCurrentUser(session.accessToken, {
          address: inlineAddress,
          location: { city: inlineAddress.city, state: inlineAddress.state },
        });
        setAccountAddress(addressResponse.user?.addresses?.[0] ?? { ...inlineAddress, complete: true });
      }
      const registration = {
        color: profileData.color,
        driverLicense: profileData.driverLicense,
        plate: profileData.plate,
        vehicleKind: profileData.vehicleKind,
        vehicleModel: profileData.vehicleModel,
      };

      if (!pendingCourierService || pendingCourierService.requiresCourierProfile) {
        const response = await saveCourierProfile(session.accessToken, profileData);
        setCourierProfile(response.profile);
      }

      if (pendingCourierService) {
        await updateSellerService(session.accessToken, {
          available: true,
          registration,
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
      await load({ silent: true });
    } catch (requestError) {
      setCourierError(requestError.message ?? "Nao foi possivel salvar o cadastro de transporte.");
    } finally {
      setCourierSaving(false);
    }
  }

  async function updateDispatchScope(acceptsPlatformCalls) {
    if (!session?.accessToken || courierScopeSaving || acceptsPlatformCalls === receivesPlatformCalls) return;
    setCourierScopeSaving(true);
    setError("");
    try {
      const response = await updateCourierDispatchScope(session.accessToken, acceptsPlatformCalls);
      setCourierProfile(response.profile);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel atualizar onde voce recebe chamadas.");
    } finally {
      setCourierScopeSaving(false);
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

  async function openCourierRide(request) {
    if (!session?.accessToken || !request?.conversationId) return;
    setError("");
    try {
      const response = await getServiceConversation(session.accessToken, request.conversationId);
      navigation.navigate("ServiceConversation", { conversation: response.conversation });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel abrir esta corrida.");
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <PageHeader
        action={<StatusPill activeCount={activeServices.length} courierStatus={courierDashboard?.operationalStatus} />}
        eyebrow={courierProfile ? "Area do entregador" : "Prestador de servicos"}
        subtitle={courierProfile
          ? "Corrida atual, novas chamadas e disponibilidade em um unico lugar."
          : "Escolha o que atende agora e acompanhe os chamados recebidos pelo chat."}
        title={courierProfile ? "Central de corridas" : `Servicos de ${profile?.publicName ?? "voce"}`}
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

          {!courierProfile ? (
            <>
              <ServiceCatalog
                loadingServiceId={savingServiceId}
                onStart={startService}
                services={catalogServices}
                subtitle="Escolha uma atividade e conclua somente o cadastro necessario"
                title="Servicos disponiveis"
              />
              <RegisterServicePrompt onPress={() => { setRegisterServiceError(""); setRegisterServiceOpen(true); }} />
            </>
          ) : null}

          {courierProfile ? (
            <>
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
              <CourierDispatchScope
                acceptsPlatformCalls={receivesPlatformCalls}
                canUseTeamOnly={courierProfile.linkedStoreCount > 0}
                isBusy={courierDashboard?.operationalStatus === "BUSY"}
                isOnline={Boolean(courierService?.available)}
                loading={courierScopeSaving}
                onChange={updateDispatchScope}
              />
              <CourierOperationsPanel
                currentConversation={courierCalls[0] ?? null}
                dashboard={courierDashboard}
                onOpenConversation={(conversation) => navigation.navigate("ServiceConversation", { conversation })}
                onOpenRide={openCourierRide}
                pendingCount={courierRequests.length}
              />
              {courierConversations.length ? (
                <>
                  <SectionTitle
                    icon="chatbubbles-outline"
                    subtitle="Corridas ativas e historico continuam aqui mesmo quando voce ficar offline"
                    title="Conversas de corridas"
                    value={courierConversations.length}
                  />
                  <View style={styles.callsList}>
                    {courierConversations.map((conversation) => (
                      <ServiceCallCard
                        conversation={conversation}
                        key={conversation.id}
                        onPress={() => navigation.navigate("ServiceConversation", { conversation })}
                      />
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          {courierRequests.length ? (
            <>
              <SectionTitle
                icon="notifications-outline"
                subtitle="Aceite para entrar no chat e combinar valor e entrega"
                title="Chamadas tocando"
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

          <SectionTitle
            icon="flash-outline"
            subtitle={courierProfile ? "Fique online para receber corridas mesmo com o app em segundo plano" : "Ative apenas o que voce consegue atender agora"}
            title={courierProfile ? "Disponibilidade para corridas" : "Minha disponibilidade"}
          />
          {(courierProfile ? courierRegisteredServices : registeredServices).length ? (
            <ServiceAvailabilityList
              courierProfile={courierProfile}
              onToggle={toggleService}
              savingServiceId={savingServiceId}
              services={courierProfile ? courierRegisteredServices : registeredServices}
            />
          ) : <StatePanel icon="briefcase-outline" text="Escolha uma das opcoes acima para realizar seu primeiro servico." title="Nenhum servico cadastrado" />}

          {courierProfile ? (
            <>
              {otherRegisteredServices.length ? (
                <>
                  <SectionTitle
                    icon="briefcase-outline"
                    subtitle="Atividades extras separadas da sua central de corridas"
                    title="Outros servicos cadastrados"
                  />
                  <ServiceAvailabilityList
                    courierProfile={courierProfile}
                    onToggle={toggleService}
                    savingServiceId={savingServiceId}
                    services={otherRegisteredServices}
                  />
                </>
              ) : null}
              <ServiceCatalog
                loadingServiceId={savingServiceId}
                onStart={startService}
                services={catalogServices}
                subtitle="Cadastre somente se tambem quiser atender outra atividade"
                title="Outros servicos"
              />
              <RegisterServicePrompt onPress={() => { setRegisterServiceError(""); setRegisterServiceOpen(true); }} />
            </>
          ) : null}

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
        accountAddress={accountAddress}
        error={courierError}
        loading={courierSaving}
        onClose={() => {
          if (courierSaving) return;
          setCourierModalOpen(false);
          setPendingCourierService(null);
        }}
        onSubmit={submitCourierProfile}
        open={courierModalOpen}
        profile={pendingCourierService && !pendingCourierService.requiresCourierProfile ? null : courierProfile}
        service={pendingCourierService}
      />
      <RegisterServiceModal
        error={registerServiceError}
        loading={registeringService}
        onClose={() => {
          if (registeringService) return;
          setRegisterServiceOpen(false);
          setRegisterServiceError("");
        }}
        onSubmit={submitServiceRegistration}
        open={registerServiceOpen}
      />
    </ScreenContainer>
  );
}

function StatusPill({ activeCount, courierStatus }) {
  const isBusy = courierStatus === "BUSY";
  return <View style={[styles.statusPill, activeCount && styles.statusPillActive]}><View style={[styles.statusDot, activeCount && styles.statusDotActive]} /><Text style={[styles.statusText, activeCount && styles.statusTextActive]}>{isBusy ? "Em corrida" : activeCount ? `${activeCount} ativo${activeCount === 1 ? "" : "s"}` : "Offline"}</Text></View>;
}

function ServiceAvailabilityList({ courierProfile, onToggle, savingServiceId, services }) {
  return (
    <View style={styles.serviceList}>
      {services.map((service) => (
        <View key={service.id} style={[styles.serviceCard, service.available && styles.serviceCardActive]}>
          <View style={styles.serviceIcon}>
            <Ionicons color={colors.primaryDark} name={serviceIcon(service.iconName)} size={21} />
          </View>
          <View style={styles.serviceCopy}>
            <View style={styles.serviceNameLine}>
              <Text style={styles.serviceName}>{service.name}</Text>
              {service.requiresCourierProfile ? (
                <View style={styles.deliveryPill}>
                  <Ionicons color={colors.primaryDark} name="bicycle-outline" size={12} />
                  <Text style={styles.deliveryPillText}>Central de corridas</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.serviceMeta}>
              {service.available
                ? "Online e disponivel para novas chamadas"
                : service.requiresCourierProfile && !courierProfile
                  ? "Cadastre seu veiculo para ativar"
                  : "Offline para novos chamados"}
            </Text>
          </View>
          {savingServiceId === service.id ? (
            <ActivityIndicator color={colors.primaryDark} />
          ) : (
            <Switch
              disabled={Boolean(savingServiceId)}
              onValueChange={() => onToggle(service)}
              thumbColor={colors.card}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              value={service.available}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function ServiceCatalog({ loadingServiceId, onStart, services, subtitle, title }) {
  if (!services.length) return null;
  return (
    <>
      <SectionTitle icon="grid-outline" subtitle={subtitle} title={title} />
      <View style={styles.catalogList}>
        {services.map((service) => (
          <View key={service.id} style={styles.catalogCard}>
            <View style={styles.catalogTop}>
              <View style={styles.catalogIcon}>
                <Ionicons color={colors.primaryDark} name={serviceIcon(service.iconName)} size={23} />
              </View>
              <View style={styles.serviceCopy}>
                <Text style={styles.catalogName}>{service.name}</Text>
                <Text style={styles.catalogDescription}>
                  {service.description || "Atendimento por chamado no aplicativo."}
                </Text>
              </View>
            </View>
            <View style={styles.requirementList}>
              {service.registrationRequirements?.requiresVehicle ? (
                <Text style={styles.requirementPill}>
                  {service.registrationRequirements.vehicleKinds?.join(" / ") || "Veiculo"}
                </Text>
              ) : null}
              {service.registrationRequirements?.requiresDriverLicense ? <Text style={styles.requirementPill}>CNH</Text> : null}
              {service.registrationRequirements?.requiresPlate ? <Text style={styles.requirementPill}>Placa</Text> : null}
              {!service.registrationRequirements?.requiresVehicle
                && !service.registrationRequirements?.requiresDriverLicense
                && !service.registrationRequirements?.requiresPlate ? (
                  <Text style={styles.requirementPill}>Cadastro rapido</Text>
                ) : null}
            </View>
            <Pressable
              disabled={Boolean(loadingServiceId)}
              onPress={() => onStart(service)}
              style={({ pressed }) => [styles.performButton, pressed && styles.pressed]}
            >
              {loadingServiceId === service.id ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <>
                  <Text style={styles.performButtonText}>Quero realizar este servico</Text>
                  <Ionicons color={colors.card} name="arrow-forward" size={18} />
                </>
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

function RegisterServicePrompt({ onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.registerService, pressed && styles.pressed]}>
      <View style={styles.registerServiceIcon}>
        <Ionicons color={colors.primaryDark} name="add-circle-outline" size={22} />
      </View>
      <View style={styles.serviceCopy}>
        <Text style={styles.registerServiceTitle}>Realizar outro servico</Text>
        <Text style={styles.registerServiceText}>Procure outra atividade sem misturar com sua central atual.</Text>
      </View>
      <Ionicons color={colors.primaryDark} name="arrow-forward" size={20} />
    </Pressable>
  );
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
            <Text numberOfLines={1} style={styles.requestName}>{request.store?.name ?? "Cliente solicitante"}</Text>
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

function CourierOperationsPanel({ currentConversation, dashboard, onOpenConversation, onOpenRide, pendingCount }) {
  const status = dashboard?.operationalStatus ?? "OFFLINE";
  const isBusy = status === "BUSY";
  const isAvailable = status === "AVAILABLE";
  const recentRides = dashboard?.recentRides?.slice(0, 3) ?? [];

  return (
    <View style={styles.operationsPanel}>
      <View style={styles.operationsHeader}>
        <View style={[styles.operationsStatusIcon, isBusy && styles.operationsStatusIconBusy]}>
          <Ionicons color={colors.card} name={isBusy ? "navigate" : isAvailable ? "radio" : "pause"} size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.operationsEyebrow}>CENTRAL DO MOTOBOY</Text>
          <Text style={styles.operationsTitle}>{isBusy ? "Corrida em andamento" : isAvailable ? "Pronto para receber" : "Operacao pausada"}</Text>
          <Text style={styles.operationsText}>{isBusy ? "Novas chamadas ficam ocultas ate esta corrida terminar." : isAvailable ? "A primeira chamada aceita abre a rota e o chat." : "Fique online para voltar a receber chamadas."}</Text>
        </View>
        {pendingCount ? <View style={styles.ringingPill}><View style={styles.ringingDot} /><Text style={styles.ringingText}>{pendingCount} tocando</Text></View> : null}
      </View>

      <View style={styles.operationsMetrics}>
        <OperationMetric label="Hoje" value={dashboard?.completedToday ?? 0} />
        <OperationMetric label="Entregas" value={dashboard?.totalDeliveries ?? 0} />
        <OperationMetric label="Lojas" value={dashboard?.linkedStoreCount ?? 0} />
      </View>

      {currentConversation ? (
        <Pressable onPress={() => onOpenConversation(currentConversation)} style={({ pressed }) => [styles.currentRide, pressed && styles.pressed]}>
          <View style={styles.currentRideIcon}><Ionicons color={colors.primaryDark} name="navigate-outline" size={19} /></View>
          <View style={styles.copy}>
            <Text style={styles.currentRideLabel}>CORRIDA ATUAL</Text>
            <Text numberOfLines={1} style={styles.currentRideTitle}>{currentConversation.request?.store?.name ?? "Entrega em atendimento"}</Text>
            <Text numberOfLines={1} style={styles.currentRideRoute}>{currentConversation.request?.destination || "Destino no chat"}</Text>
          </View>
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={19} />
        </Pressable>
      ) : null}

      {!currentConversation && recentRides.length ? (
        <View style={styles.recentRides}>
          <Text style={styles.recentRidesTitle}>Atividade recente</Text>
          {recentRides.map((ride) => (
            <Pressable disabled={!ride.conversationId} key={ride.id} onPress={() => onOpenRide(ride)} style={({ pressed }) => [styles.recentRideRow, pressed && styles.pressed]}>
              <Ionicons color={ride.status === "CONCLUIDA" ? colors.success : colors.textMuted} name={ride.status === "CONCLUIDA" ? "checkmark-circle-outline" : "close-circle-outline"} size={18} />
              <View style={styles.copy}><Text numberOfLines={1} style={styles.recentRideName}>{ride.store?.name ?? "Corrida"}</Text><Text style={styles.recentRideStatus}>{ride.status === "CONCLUIDA" ? "Concluida" : "Cancelada"}</Text></View>
              <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OperationMetric({ label, value }) {
  return <View style={styles.operationMetric}><Text style={styles.operationMetricValue}>{value}</Text><Text style={styles.operationMetricLabel}>{label}</Text></View>;
}

function CourierDispatchScope({ acceptsPlatformCalls, canUseTeamOnly, isBusy, isOnline, loading, onChange }) {
  return (
    <View style={styles.dispatchScope}>
      <View style={styles.dispatchScopeHeader}>
        <View style={styles.dispatchScopeIcon}><Ionicons color={colors.primaryDark} name="radio-outline" size={19} /></View>
        <View style={styles.copy}>
          <Text style={styles.dispatchScopeTitle}>Central do entregador</Text>
          <Text style={styles.dispatchScopeText}>{isBusy ? "Em corrida; novas chamadas estao pausadas" : isOnline ? "Online para novas corridas" : "Ative um servico de corrida para receber chamadas"}</Text>
        </View>
        <View style={[styles.dispatchStatus, isOnline && styles.dispatchStatusOnline]}><View style={[styles.dispatchDot, isOnline && styles.dispatchDotOnline]} /><Text style={[styles.dispatchStatusText, isOnline && styles.dispatchStatusTextOnline]}>{isBusy ? "Ocupado" : isOnline ? "Online" : "Offline"}</Text></View>
      </View>
      <Text style={styles.dispatchScopeLabel}>Receber chamadas de</Text>
      <View style={styles.dispatchScopeOptions}>
        <Pressable disabled={loading} onPress={() => onChange(true)} style={[styles.dispatchScopeOption, acceptsPlatformCalls && styles.dispatchScopeOptionActive]}>
          <Ionicons color={acceptsPlatformCalls ? colors.card : colors.primaryDark} name="globe-outline" size={16} />
          <Text style={[styles.dispatchScopeOptionText, acceptsPlatformCalls && styles.dispatchScopeOptionTextActive]}>Toda a cidade</Text>
        </Pressable>
        <Pressable disabled={loading || !canUseTeamOnly} onPress={() => onChange(false)} style={[styles.dispatchScopeOption, !acceptsPlatformCalls && styles.dispatchScopeOptionActive, !canUseTeamOnly && styles.dispatchScopeOptionDisabled]}>
          <Ionicons color={!acceptsPlatformCalls ? colors.card : colors.primaryDark} name="storefront-outline" size={16} />
          <Text style={[styles.dispatchScopeOptionText, !acceptsPlatformCalls && styles.dispatchScopeOptionTextActive]}>Minhas lojas</Text>
        </Pressable>
      </View>
      <Text style={styles.dispatchScopeHint}>{acceptsPlatformCalls ? "Chamadas gerais da sua cidade chegam aqui em tempo real." : "Somente lojas que credenciaram voce podem chamar diretamente."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  acceptButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.md },
  acceptButtonText: { color: colors.card, flex: 1, fontFamily: fonts.bold, fontSize: typography.small, textAlign: "center" },
  catalogCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadowSoft },
  catalogDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  catalogIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  catalogList: { gap: spacing.sm },
  catalogName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  catalogTop: { alignItems: "center", flexDirection: "row", gap: spacing.md },
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
  currentRide: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  currentRideIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  currentRideLabel: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9 },
  currentRideRoute: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  currentRideTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  deliveryPill: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  deliveryPillText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
  dispatchDot: { backgroundColor: colors.textMuted, borderRadius: radius.round, height: 6, width: 6 },
  dispatchDotOnline: { backgroundColor: colors.success },
  dispatchScope: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...shadowSoft },
  dispatchScopeHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  dispatchScopeHint: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  dispatchScopeIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  dispatchScopeLabel: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, marginTop: spacing.xs },
  dispatchScopeOption: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 40, paddingHorizontal: spacing.sm },
  dispatchScopeOptionActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  dispatchScopeOptionDisabled: { opacity: 0.45 },
  dispatchScopeOptionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 11 },
  dispatchScopeOptionTextActive: { color: colors.card },
  dispatchScopeOptions: { flexDirection: "row", gap: spacing.sm },
  dispatchScopeText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  dispatchScopeTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
  dispatchStatus: { alignItems: "center", backgroundColor: colors.backgroundSoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 4 },
  dispatchStatusOnline: { backgroundColor: colors.primarySoft },
  dispatchStatusText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 9 },
  dispatchStatusTextOnline: { color: colors.primaryDark },
  deliveryCallCard: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight },
  deliveryCallIcon: { backgroundColor: colors.primaryDark },
  directPill: { backgroundColor: colors.warningSoft ?? "#FFF4D8", borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 3 },
  directPillText: { color: "#7A4A00", fontFamily: fonts.extraBold, fontSize: 8 },
  pressed: { opacity: 0.78 },
  operationMetric: { alignItems: "center", borderRightColor: colors.border, borderRightWidth: 1, flex: 1, gap: 2 },
  operationMetricLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10 },
  operationMetricValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3 },
  performButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  performButtonText: { color: colors.card, flex: 1, fontFamily: fonts.bold, fontSize: typography.caption, textAlign: "center" },
  operationsEyebrow: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 9 },
  operationsHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  operationsMetrics: { backgroundColor: colors.backgroundSoft, borderRadius: radius.md, flexDirection: "row", paddingVertical: spacing.sm },
  operationsPanel: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadowSoft },
  operationsStatusIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  operationsStatusIconBusy: { backgroundColor: colors.info },
  operationsText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  operationsTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label },
  recentRideName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.caption },
  recentRideRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 42, paddingTop: spacing.sm },
  recentRideStatus: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
  recentRides: { gap: spacing.sm },
  recentRidesTitle: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10 },
  ringingDot: { backgroundColor: colors.danger, borderRadius: radius.round, height: 6, width: 6 },
  ringingPill: { alignItems: "center", backgroundColor: colors.dangerSoft, borderRadius: radius.round, flexDirection: "row", gap: 4, paddingHorizontal: 7, paddingVertical: 5 },
  ringingText: { color: colors.danger, fontFamily: fonts.extraBold, fontSize: 9 },
  requestCaption: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  requestCard: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadowSoft },
  requestCardDirect: { borderColor: colors.warning ?? "#F5B942" },
  requestDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  requestIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  requestList: { gap: spacing.sm },
  requestName: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: typography.small },
  requestNameLine: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  requestTopline: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  requirementList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  requirementPill: { backgroundColor: colors.primarySoft, borderRadius: radius.round, color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9, overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: 5 },
  routeBox: { backgroundColor: colors.backgroundSoft, borderRadius: radius.md, gap: spacing.sm, padding: spacing.sm },
  routeDivider: { backgroundColor: colors.border, height: 1, marginLeft: 23 },
  routeRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  routeText: { color: colors.textPrimary, flex: 1, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  registerService: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  registerServiceIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  registerServiceText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  registerServiceTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small },
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
