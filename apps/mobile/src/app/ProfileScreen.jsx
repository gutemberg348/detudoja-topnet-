import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { ProfileEditModal } from "./profile/ProfileEditModal";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { getCustomerOrders } from "../services/orders.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getServiceConversations } from "../services/service-chats.api";
import {
  getStoreConversations,
  subscribeStoreConversationRead,
} from "../services/store-chats.api";
import { getCurrentUser, updateCurrentUser } from "../services/users.api";
import { fetchCepAddress } from "../services/cep.api";
import { ApiError } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useWalletStore } from "../stores/useWalletStore";
import {
  formatPhone,
  formatCep,
  isValidEmail,
  isValidPhone,
  onlyDigits,
} from "../utils/authValidation";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

const accountTypeLabels = {
  ADMIN: "Administrador",
  CONSUMIDOR: "Consumidor",
  LOJISTA: "Lojista",
  SUPORTE: "Suporte",
  VENDEDOR: "Vendedor",
};

const statusLabels = {
  ATIVO: "Conta ativa",
  BLOQUEADO: "Conta bloqueada",
  EM_ANALISE: "Em analise",
  INATIVO: "Conta inativa",
  PENDENTE: "Pendente",
  REPROVADO: "Reprovado",
  APROVADO: "Verificado",
  OURO: "Ouro",
  PRATA: "Prata",
  TIER_1: "Nivel inicial",
  TIER_2: "Nivel verificado",
};

const activeOrderStatuses = new Set([
  "NEGOCIANDO",
  "AGUARDANDO_PAGAMENTO",
  "RECEBIDO",
  "ACEITO",
  "PREPARANDO",
  "SAIU_ENTREGA",
  "PRONTO_RETIRADA",
]);

function isActiveOrder(order) {
  return activeOrderStatuses.has(order.status);
}

function unreadCustomerMessages(order) {
  return Number(order.unreadCustomerMessages ?? order.unreadMessagesCount ?? 0);
}

function countUnreadCustomerMessages(orders) {
  return orders.reduce(
    (total, order) => total + unreadCustomerMessages(order),
    0,
  );
}

export function ProfileScreen({ navigation }) {
  const { logout, session, updateSessionUser } = useAuthStore();
  const wallet = useWalletStore();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [address, setAddress] = useState({
    city: "",
    complement: "",
    district: "",
    number: "",
    reference: "",
    state: "",
    street: "",
    zipCode: "",
  });
  const [unreadOrderMessagesCount, setUnreadOrderMessagesCount] = useState(0);
  const [unreadServiceCount, setUnreadServiceCount] = useState(0);
  const [unreadStoreChatCount, setUnreadStoreChatCount] = useState(0);
  const [phone, setPhone] = useState("");
  const [profile, setProfile] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!session?.accessToken) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await getCurrentUser(session.accessToken);
      setProfile(response.user);
      fillForm(response.user);
      updateSessionUser({
        kycLevel: response.user.kycLevel,
        kycStatus: response.user.kycStatus,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar o perfil.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.accessToken]);

  const loadOrders = useCallback(async () => {
    if (!session?.accessToken) {
      setActiveOrdersCount(0);
      setUnreadOrderMessagesCount(0);
      return;
    }

    try {
      const response = await getCustomerOrders(session.accessToken);
      const orders = response.orders ?? [];

      setActiveOrdersCount(orders.filter(isActiveOrder).length);
      setUnreadOrderMessagesCount(countUnreadCustomerMessages(orders));
    } catch {
      setActiveOrdersCount(0);
      setUnreadOrderMessagesCount(0);
    }
  }, [session?.accessToken]);

  const loadServices = useCallback(async () => {
    if (!session?.accessToken) {
      setUnreadServiceCount(0);
      return;
    }

    try {
      const response = await getServiceConversations(session.accessToken);
      setUnreadServiceCount(
        (response.conversations ?? []).filter(
          (conversation) =>
            !conversation.isSeller && Number(conversation.unreadCount ?? 0) > 0,
        ).length,
      );
    } catch {
      setUnreadServiceCount(0);
    }
  }, [session?.accessToken]);

  const loadStoreChats = useCallback(async () => {
    if (!session?.accessToken) {
      setUnreadStoreChatCount(0);
      return;
    }

    try {
      const response = await getStoreConversations(session.accessToken);
      const conversations = response.conversations ?? [];
      setUnreadStoreChatCount(
        conversations.reduce(
          (total, conversation) =>
            total + Number(conversation.unreadCount ?? 0),
          0,
        ),
      );
    } catch {
      setUnreadStoreChatCount(0);
    }
  }, [session?.accessToken]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadOrders();
      loadServices();
      loadStoreChats();
    }, [loadOrders, loadProfile, loadServices, loadStoreChats]),
  );

  const handleRealtimeOrder = useCallback(() => {
    loadOrders();
  }, [loadOrders]);

  useRealtimeOrders({
    accessToken: session?.accessToken,
    onMessageEvent: handleRealtimeOrder,
    onOrderEvent: handleRealtimeOrder,
  });

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => loadServices();

    socket?.on(realtimeEvents.serviceChatMessageCreated, refresh);
    socket?.on(realtimeEvents.serviceChatUpdated, refresh);

    return () => {
      socket?.off(realtimeEvents.serviceChatMessageCreated, refresh);
      socket?.off(realtimeEvents.serviceChatUpdated, refresh);
    };
  }, [loadServices, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => loadStoreChats();

    socket?.on(realtimeEvents.storeChatCreated, refresh);
    socket?.on(realtimeEvents.storeChatMessageCreated, refresh);
    socket?.on(realtimeEvents.storeChatUpdated, refresh);

    return () => {
      socket?.off(realtimeEvents.storeChatCreated, refresh);
      socket?.off(realtimeEvents.storeChatMessageCreated, refresh);
      socket?.off(realtimeEvents.storeChatUpdated, refresh);
    };
  }, [loadStoreChats, session?.accessToken]);

  useEffect(
    () =>
      subscribeStoreConversationRead(({ scope }) => {
        if (scope === "customer") {
          loadStoreChats();
        }
      }),
    [loadStoreChats],
  );

  function fillForm(user) {
    const primaryAddress = user.addresses?.[0] ?? {};
    setAddress({
      city: primaryAddress.cidade ?? "",
      complement: primaryAddress.complemento ?? "",
      district: primaryAddress.bairro ?? "",
      number: primaryAddress.numero ?? "",
      reference: primaryAddress.referencia ?? "",
      state: primaryAddress.estado ?? "",
      street: primaryAddress.rua ?? "",
      zipCode: formatCep(primaryAddress.cep ?? ""),
    });
    setEmail(user.email ?? "");
    setName(user.name ?? "");
    setPhone(formatPhone(user.phone ?? ""));
  }

  async function saveProfile() {
    const errors = {};

    if (name.trim().length < 3) {
      errors.name = "Informe seu nome completo.";
    }
    if (!isValidEmail(email)) {
      errors.email = "Digite um e-mail valido.";
    }
    if (!isValidPhone(phone)) {
      errors.phone = "Digite um telefone com DDD.";
    }
    if (!address.street.trim()) errors.street = "Informe sua rua.";
    if (!address.number.trim()) errors.number = "Informe o numero.";
    if (!address.district.trim()) errors.district = "Informe seu bairro.";
    if (!address.city.trim()) errors.city = "Informe sua cidade.";
    if (!/^[A-Za-z]{2}$/.test(address.state.trim()))
      errors.state = "Informe a UF.";
    if (onlyDigits(address.zipCode).length !== 8)
      errors.zipCode = "Informe um CEP valido.";

    setFieldErrors(errors);
    setError("");

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await updateCurrentUser(session.accessToken, {
        address: {
          ...address,
          state: address.state.trim().toUpperCase(),
          zipCode: onlyDigits(address.zipCode),
        },
        email: email.trim().toLowerCase(),
        name: name.trim(),
        phone: onlyDigits(phone),
      });
      setProfile(response.user);
      fillForm(response.user);
      updateSessionUser({
        email: response.user.email,
        name: response.user.name,
        phone: response.user.phone,
      });
      setEditing(false);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError(requestError.message);
      } else {
        setError(requestError.message ?? "Nao foi possivel salvar os dados.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
        <Text style={styles.loadingText}>Carregando seu perfil...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Ionicons
          color={colors.danger}
          name="person-circle-outline"
          size={38}
        />
        <Text style={styles.errorText}>{error}</Text>
        <AppButton onPress={loadProfile} title="Tentar novamente" />
      </View>
    );
  }

  const isKycApproved = profile.kycStatus === "APROVADO";
  const accountLevel = profile.accountLevel ?? "PRATA";
  const hasActiveOrders = activeOrdersCount > 0;
  const hasUnreadOrderMessages = unreadOrderMessagesCount > 0;
  const hasUnreadStoreChats = unreadStoreChatCount > 0;

  async function handleAddressCep(value) {
    const zipCode = formatCep(value);
    setAddress((current) => ({ ...current, zipCode }));
    setFieldErrors((current) => ({ ...current, zipCode: undefined }));
    if (onlyDigits(zipCode).length !== 8) return;

    try {
      const cepAddress = await fetchCepAddress(zipCode);
      setAddress((current) => ({
        ...current,
        city: cepAddress.cidade || current.city,
        district: cepAddress.bairro || current.district,
        state: cepAddress.estado || current.state,
        street: cepAddress.rua || current.street,
        zipCode,
      }));
    } catch {
      setError("CEP nao encontrado. Complete seu endereco manualmente.");
    }
  }

  function updateAddress(field, value) {
    setAddress((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function openStoreChats() {
    navigation.navigate("StoreChatsInbox");
  }

  const quickActions = [
    {
      badgeText: hasUnreadOrderMessages
        ? String(unreadOrderMessagesCount)
        : hasActiveOrders
          ? String(activeOrdersCount)
          : undefined,
      icon: "receipt-outline",
      label: "Pedidos",
      meta: hasUnreadOrderMessages
        ? `${unreadOrderMessagesCount} ${unreadOrderMessagesCount > 1 ? "mensagens" : "mensagem"} da loja`
        : hasActiveOrders
          ? "Atualizacoes em andamento"
          : "Historico e acompanhamento",
      notify: hasUnreadOrderMessages || hasActiveOrders,
      badgeTextColor: hasUnreadOrderMessages ? "#4A2B00" : colors.card,
      notifyColor: hasUnreadOrderMessages ? colors.warning : colors.info,
      route: "CustomerOrders",
    },
    {
      badgeText: hasUnreadStoreChats ? String(unreadStoreChatCount) : undefined,
      badgeTextColor: "#4A2B00",
      icon: "chatbubbles-outline",
      label: "Conversar",
      meta: hasUnreadStoreChats
        ? `${unreadStoreChatCount} nova${unreadStoreChatCount === 1 ? "" : "s"}`
        : "Lojas",
      notify: hasUnreadStoreChats,
      notifyColor: colors.warning,
      onPress: openStoreChats,
    },
    {
      badgeText: unreadServiceCount ? String(unreadServiceCount) : undefined,
      icon: "briefcase-outline",
      label: "Atendimentos",
      meta: unreadServiceCount
        ? `${unreadServiceCount} conversa${unreadServiceCount === 1 ? "" : "s"} com novidade`
        : "Servicos e propostas",
      notify: unreadServiceCount > 0,
      badgeTextColor: "#4A2B00",
      notifyColor: colors.warning,
      route: "CustomerOrders",
      params: { initialView: "services" },
    },
    {
      icon: "scan-outline",
      label: "Pagar QR",
      meta: "Ler cobranca",
      route: "ChargeScan",
    },
    {
      icon: "wallet-outline",
      label: "Carteiras",
      meta: "Saldos e extrato",
      route: "Carteira",
    },
    {
      icon: "chatbubbles-outline",
      label: "Suporte",
      meta: "Fale com a equipe",
      route: "Suporte",
    },
  ];

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.profilePageHeading}>
        <View style={styles.profilePageIcon}>
          <Ionicons color={colors.primaryDark} name="person-outline" size={22} />
        </View>
        <View style={styles.profilePageCopy}>
          <Text style={styles.profilePageTitle}>Perfil</Text>
          <Text style={styles.profilePageSubtitle}>Conta, saldos e seguranca</Text>
        </View>
      </View>

      <ProfileHero
        onEdit={() => {
          fillForm(profile);
          setError("");
          setFieldErrors({});
          setEditing((current) => !current);
        }}
        profile={profile}
      />

      <WalletPreview
        isLoading={wallet.isLoading}
        onOpen={() => navigation.navigate("Carteira")}
        summary={wallet.summary}
        wallets={wallet.wallets}
      />

      <ProfileEditModal
        address={address}
        error={error}
        fieldErrors={fieldErrors}
        isSaving={isSaving}
        onAddressChange={{
          city: (value) => updateAddress("city", value),
          district: (value) => updateAddress("district", value),
          number: (value) => updateAddress("number", value),
          state: (value) => updateAddress("state", value.toUpperCase()),
          street: (value) => updateAddress("street", value),
          zipCode: handleAddressCep,
        }}
        onClose={() => {
          setEditing(false);
          setError("");
          setFieldErrors({});
        }}
        onEmailChange={(value) => {
          setEmail(value);
          setFieldErrors((current) => ({ ...current, email: undefined }));
        }}
        onNameChange={(value) => {
          setName(value);
          setFieldErrors((current) => ({ ...current, name: undefined }));
        }}
        onPhoneChange={(value) => {
          setPhone(formatPhone(value));
          setFieldErrors((current) => ({ ...current, phone: undefined }));
        }}
        onSubmit={saveProfile}
        open={editing}
        values={{ email, name, phone }}
      />

      <View style={styles.quickMenu}>
        {quickActions.map((item) => (
          <QuickAction
            badgeText={item.badgeText}
            badgeTextColor={item.badgeTextColor}
            icon={item.icon}
            key={item.label}
            label={item.label}
            meta={item.meta}
            notifyColor={item.notifyColor}
            onPress={
              item.onPress ??
              (() => navigation.navigate(item.route, item.params))
            }
          />
        ))}
      </View>

      <ProfileSectionHeading
        icon="shield-checkmark-outline"
        subtitle="Seguranca e beneficios da sua conta"
        title="Seu nivel"
      />

      <View style={styles.accountStatus}>
        <StatusItem
          icon="ribbon-outline"
          label="Nivel da conta"
          tone={accountLevel === "OURO" ? "gold" : "silver"}
          value={
            statusLabels[accountLevel] ?? profile.accountLevelLabel ?? "Prata"
          }
        />
        <View style={styles.statusDivider} />
        <StatusItem
          icon="shield-checkmark-outline"
          label="Verificacao KYC"
          notify={!isKycApproved}
          onPress={() => navigation.navigate("KycVerification")}
          value={statusLabels[profile.kycStatus] ?? profile.kycStatus}
        />
      </View>

      <ProfileSectionHeading
        icon="person-circle-outline"
        subtitle="Informacoes usadas na sua conta"
        title="Dados pessoais"
      />

      <View style={styles.detailsCard}>
        <DetailRow
          icon="call-outline"
          label="Telefone"
          value={formatPhone(profile.phone) || "Nao informado"}
        />
        <DetailRow
          icon="person-circle-outline"
          label="Tipo de conta"
          value={accountTypeLabels[profile.accountType] ?? profile.accountType}
        />
        <DetailRow
          icon="card-outline"
          label="CPF"
          value={profile.cpf ?? "Nao informado"}
        />
        <DetailRow
          icon="checkmark-circle-outline"
          label="E-mail verificado"
          value={profile.emailVerified ? "Sim" : "Nao"}
        />
        <DetailRow
          icon="location-outline"
          label="Enderecos cadastrados"
          value={String(profile.addresses.length)}
        />
        <DetailRow
          icon="calendar-outline"
          label="Membro desde"
          value={new Date(profile.createdAt).toLocaleDateString("pt-BR")}
        />
      </View>

      <Pressable onPress={logout} style={styles.logout}>
        <Ionicons color={colors.danger} name="log-out-outline" size={20} />
        <Text style={styles.logoutText}>Sair da conta</Text>
      </Pressable>
    </ScreenContainer>
  );
}

function ProfileHero({ onEdit, profile }) {
  return (
    <View style={styles.profileHero}>
      <View style={styles.profileHeroTopline}>
        <View style={styles.profileEyebrowRow}>
          <Ionicons
            color={colors.primaryDark}
            name="id-card-outline"
            size={16}
          />
          <Text style={styles.profileEyebrow}>SUA IDENTIDADE</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusBadgeText}>
            {statusLabels[profile.status] ?? profile.status}
          </Text>
        </View>
      </View>

      <View style={styles.profileIdentity}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Ionicons color={colors.card} name="person-outline" size={31} />
          </View>
        </View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={styles.name}>
            {profile.name}
          </Text>
          <Text numberOfLines={1} style={styles.email}>
            {profile.email}
          </Text>
          <Text style={styles.memberMeta}>
            Cliente desde {new Date(profile.createdAt).getFullYear()}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Editar meus dados"
          onPress={onEdit}
          style={({ pressed }) => [
            styles.editButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color={colors.primaryDark}
            name="pencil-outline"
            size={20}
          />
        </Pressable>
      </View>
    </View>
  );
}

function QuickAction({
  badgeText,
  badgeTextColor,
  icon,
  label,
  meta,
  notifyColor,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={styles.quickIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={21} />
        {badgeText ? (
          <View
            style={[
              styles.quickBadge,
              notifyColor && { backgroundColor: notifyColor },
            ]}
          >
            <Text
              style={[
                styles.quickBadgeText,
                badgeTextColor && { color: badgeTextColor },
              ]}
            >
              {badgeText}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.quickCopy}>
        <Text numberOfLines={1} style={styles.quickLabel}>
          {label}
        </Text>
        <Text numberOfLines={1} style={styles.quickMeta}>
          {meta}
        </Text>
      </View>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

function ProfileSectionHeading({ icon, subtitle, title }) {
  return (
    <View style={styles.profileSectionHeading}>
      <View style={styles.profileSectionIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={19} />
      </View>
      <View style={styles.profileSectionCopy}>
        <Text style={styles.profileSectionTitle}>{title}</Text>
        <Text style={styles.profileSectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function WalletPreview({ isLoading, onOpen, summary, wallets = [] }) {
  const walletByCode = Object.fromEntries(
    wallets.map((item) => [item.code, item]),
  );
  const composition = [
    {
      accent: "#0F9F6E",
      background: "#EAFBF4",
      code: "cashback",
      icon: "bag-handle-outline",
      label: "Cashback",
    },
    {
      accent: "#07805C",
      background: "#ECFDF5",
      code: "saldo_pix",
      icon: "qr-code-outline",
      label: "Saldo Pix",
    },
    {
      accent: "#D97706",
      background: "#FFF7ED",
      code: "vendas",
      icon: "storefront-outline",
      label: "Vendas",
    },
    {
      accent: "#2563EB",
      background: "#EEF5FF",
      code: "rede",
      icon: "git-network-outline",
      label: "Rede",
    },
  ];

  return (
    <View style={styles.walletPreview}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [
          styles.walletPreviewHero,
          pressed && styles.walletPreviewHeroPressed,
        ]}
      >
        <View style={styles.walletPreviewHeader}>
          <View style={styles.walletPreviewIcon}>
            <Ionicons color={colors.card} name="wallet-outline" size={22} />
          </View>
          <View style={styles.walletPreviewCopy}>
            <Text style={styles.walletPreviewLabel}>
              Total disponivel nas carteiras
            </Text>
            <Text style={styles.walletPreviewValue}>
              {isLoading
                ? "Atualizando..."
                : formatarDinheiro(summary.availableCents)}
            </Text>
          </View>
          <Ionicons color={colors.card} name="chevron-forward" size={20} />
        </View>
        <View style={styles.walletPreviewStats}>
          <View style={styles.walletPreviewStat}>
            <Text style={styles.walletPreviewStatLabel}>Pendente</Text>
            <Text style={styles.walletPreviewStatValue}>
              {formatarDinheiro(summary.pendingCents)}
            </Text>
          </View>
          <View style={styles.walletPreviewStatDivider} />
          <View style={styles.walletPreviewStat}>
            <Text style={styles.walletPreviewStatLabel}>Bloqueado</Text>
            <Text style={styles.walletPreviewStatValue}>
              {formatarDinheiro(summary.blockedCents)}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.walletComposition}>
        {composition.map((item) => {
          const currentWallet = walletByCode[item.code];
          const availableCents = Number(currentWallet?.availableCents ?? 0);
          const pendingCents = Number(currentWallet?.pendingCents ?? 0);

          return (
            <Pressable
              key={item.code}
              onPress={onOpen}
              style={({ pressed }) => [
                styles.walletCompositionItem,
                { backgroundColor: item.background },
                pressed && styles.walletCompositionItemPressed,
              ]}
            >
              <View style={styles.walletCompositionTopline}>
                <View style={styles.walletCompositionIcon}>
                  <Ionicons color={item.accent} name={item.icon} size={17} />
                </View>
                <Ionicons color={item.accent} name="arrow-forward" size={14} />
              </View>
              <Text style={styles.walletCompositionLabel}>{item.label}</Text>
              <Text style={styles.walletCompositionValue}>
                {formatarDinheiro(availableCents)}
              </Text>
              <Text numberOfLines={1} style={styles.walletCompositionMeta}>
                {pendingCents > 0
                  ? `${formatarDinheiro(pendingCents)} pendente`
                  : "Disponivel agora"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons color={colors.textMuted} name={icon} size={19} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function StatusItem({
  icon,
  label,
  notify = false,
  onPress,
  tone = "default",
  value,
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusItem,
        onPress && pressed && styles.statusItemPressed,
      ]}
    >
      <View
        style={[
          styles.statusIconInline,
          tone === "gold" && styles.statusIconGold,
          tone === "silver" && styles.statusIconSilver,
        ]}
      >
        <Ionicons
          color={tone === "gold" ? "#A16207" : colors.primaryDark}
          name={icon}
          size={21}
        />
      </View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusValue}>{value}</Text>
      </View>
      {notify ? <View style={styles.statusNotify} /> : null}
      {onPress ? (
        <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addressCity: {
    flex: 1,
  },
  addressHint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
    marginTop: -spacing.sm,
  },
  addressRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  addressState: {
    width: 82,
  },
  addressTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  accountStatus: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarRing: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 2,
    height: 62,
    justifyContent: "center",
    width: 62,
  },
  avatarText: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.lg,
    justifyContent: "center",
    padding: spacing.xl,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.sm,
  },
  detailLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.small,
  },
  detailRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
  },
  detailValue: {
    color: colors.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: typography.small,
    fontWeight: "600",
    maxWidth: "48%",
    textAlign: "right",
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  editButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  editCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  email: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
  },
  memberMeta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: "center",
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  logout: {
    alignItems: "center",
    borderColor: "#FECACA",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 50,
  },
  logoutText: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
  },
  name: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  pressed: {
    backgroundColor: "#F9FAFB",
  },
  profileEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    fontWeight: "800",
  },
  profileEyebrowRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  profileHero: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  profileHeroTopline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  profileIdentity: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  profilePageCopy: { flex: 1, gap: 2, minWidth: 0 },
  profilePageHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
  },
  profilePageIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  profilePageSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  profilePageTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
  },
  profileCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  profileSectionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  profileSectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  profileSectionIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  profileSectionSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  profileSectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  quickAction: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  quickBadge: {
    alignItems: "center",
    backgroundColor: colors.info,
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4,
    position: "absolute",
    right: -5,
    top: -5,
  },
  quickBadgeText: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 9,
    fontWeight: "800",
  },
  quickCopy: { flex: 1, gap: 2, minWidth: 0 },
  quickIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  quickLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  quickMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  quickMenu: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  statusBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  statusCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  statusDivider: {
    backgroundColor: colors.primaryLight,
    height: 1,
    marginVertical: spacing.md,
  },
  statusDot: {
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    height: 7,
    width: 7,
  },
  statusItem: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 48,
  },
  statusItemPressed: {
    backgroundColor: "#F9FAFB",
  },
  statusIconGold: {
    backgroundColor: "#FEF3C7",
  },
  statusIconInline: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  statusIconSilver: {
    backgroundColor: "#F3F4F6",
  },
  statusLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  statusNotify: {
    backgroundColor: colors.warning,
    borderColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
  statusValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.label,
    fontWeight: "700",
  },
  walletPreview: {
    gap: spacing.md,
  },
  walletPreviewCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  walletPreviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  walletPreviewHero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    gap: spacing.lg,
    overflow: "hidden",
    padding: spacing.lg,
  },
  walletPreviewHeroPressed: {
    opacity: 0.86,
  },
  walletPreviewIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: radius.round,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  walletPreviewLabel: {
    color: "#D1FAE5",
    fontFamily: fonts.semiBold,
    fontSize: typography.small,
    fontWeight: "600",
  },
  walletComposition: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  walletCompositionItem: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
    minHeight: 116,
    minWidth: 140,
    padding: spacing.md,
  },
  walletCompositionItemPressed: {
    opacity: 0.76,
  },
  walletCompositionTopline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  walletCompositionIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  walletCompositionLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: typography.caption,
    fontWeight: "600",
  },
  walletCompositionValue: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  walletCompositionMeta: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 10,
  },
  walletPreviewStat: {
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  walletPreviewStatLabel: {
    color: "#BBF7D0",
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  walletPreviewStats: {
    borderTopColor: "rgba(255,255,255,0.16)",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingTop: spacing.md,
  },
  walletPreviewStatDivider: {
    backgroundColor: "rgba(255,255,255,0.16)",
    marginHorizontal: spacing.lg,
    width: 1,
  },
  walletPreviewStatValue: {
    color: colors.card,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    fontWeight: "700",
  },
  walletPreviewValue: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    fontWeight: "800",
  },
});
