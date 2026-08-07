import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "../components/ScreenContainer";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getGeneratedChargeQr, getGeneratedChargesHistory } from "../services/seller.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

const filters = [
  { id: "ALL", label: "Todas" },
  { id: "PRESENCIAL", label: "Locais" },
  { id: "AVULSA", label: "Autonomas" },
];

const statusCopy = {
  ATIVA: "Aguardando pagamento",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
  PAGA: "Recebida",
  PROCESSANDO: "Processando",
};

export function GeneratedChargesHistoryScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const [charges, setCharges] = useState([]);
  const [filter, setFilter] = useState(route?.params?.initialFilter ?? "ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) {
      return;
    }

    if (!silent) {
      setError("");
      setLoading(true);
    }
    try {
      const response = await getGeneratedChargesHistory(session.accessToken);
      setCharges(response.charges ?? []);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar o historico de vendas.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [session?.accessToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!session?.accessToken) {
      return undefined;
    }

    const socket = getRealtimeSocket(session.accessToken);

    if (!socket) {
      return undefined;
    }

    const refreshOnChargeUpdated = () => loadHistory({ silent: true });

    socket.on(realtimeEvents.chargeUpdated, refreshOnChargeUpdated);

    return () => {
      socket.off(realtimeEvents.chargeUpdated, refreshOnChargeUpdated);
    };
  }, [loadHistory, session?.accessToken]);

  const visibleCharges = useMemo(
    () => charges.filter((charge) => filter === "ALL" || charge.origin === filter),
    [charges, filter],
  );
  const paidCount = useMemo(
    () => visibleCharges.filter((charge) => charge.status === "PAGA").length,
    [visibleCharges],
  );
  const receivedCents = useMemo(
    () => visibleCharges
      .filter((charge) => charge.status === "PAGA")
      .reduce((total, charge) => total + Number(charge.amountCents ?? 0), 0),
    [visibleCharges],
  );
  const autonomousOnly = filter === "AVULSA";

  async function reopenCharge(charge) {
    if (charge.status !== "ATIVA" || !session?.accessToken) {
      return;
    }

    setOpeningId(charge.id);
    setError("");
    try {
      const response = await getGeneratedChargeQr(session.accessToken, charge.id);
      setCharges((current) => current.map((item) => (
        item.id === response.charge.id ? { ...item, ...response.charge } : item
      )));
      navigation.navigate("ChargeQr", {
        charge: response.charge,
        qrImageDataUrl: response.qrImageDataUrl,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel abrir esta cobranca.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons color={colors.primaryDark} name="receipt-outline" size={24} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>{autonomousOnly ? "Historico autonomo" : "CRM de vendas"}</Text>
          <Text style={styles.title}>{autonomousOnly ? "Vendas autonomas" : "Vendas geradas"}</Text>
          <Text style={styles.subtitle}>
            {autonomousOnly
              ? "Acompanhe todos os QR gerados sem loja, seus recebimentos e vencimentos."
              : "Acompanhe cada cobranca local ou autonoma, mesmo depois de fechar o QR."}
          </Text>
        </View>
      </View>

      <View style={styles.summary}>
        <SummaryMetric label="Recebidas" value={String(paidCount)} />
        <View style={styles.summaryDivider} />
        <SummaryMetric label="Valor recebido" value={formatarDinheiro(receivedCents)} />
      </View>

      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setFilter(item.id)}
            style={({ pressed }) => [
              styles.filter,
              filter === item.id && styles.filterActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={loadHistory} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
          <Ionicons color={colors.primaryDark} name="refresh" size={18} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryDark} />
          <Text style={styles.loadingText}>Carregando vendas...</Text>
        </View>
      ) : visibleCharges.length ? (
        <View style={styles.list}>
          {visibleCharges.map((charge) => (
            <ChargeHistoryCard
              charge={charge}
              key={charge.id}
              loading={openingId === charge.id}
              onPress={() => reopenCharge(charge)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Ionicons color={colors.textMuted} name="receipt-outline" size={28} />
          <Text style={styles.emptyTitle}>Nenhuma venda neste filtro</Text>
          <Text style={styles.emptyText}>
            As cobrancas criadas em loja ou como autonomo aparecerao neste CRM.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ChargeHistoryCard({ charge, loading, onPress }) {
  const isActive = charge.status === "ATIVA";
  const isPaid = charge.status === "PAGA";
  const createdAt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(charge.createdAt));

  return (
    <Pressable
      disabled={!isActive || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.chargeCard, pressed && isActive && styles.pressed]}
    >
      <View style={[styles.chargeIcon, isPaid && styles.chargeIconPaid]}>
        <Ionicons
          color={isPaid ? colors.card : colors.primaryDark}
          name={charge.origin === "PRESENCIAL" ? "storefront-outline" : "flash-outline"}
          size={20}
        />
      </View>
      <View style={styles.chargeCopy}>
        <View style={styles.chargeTopline}>
          <Text numberOfLines={1} style={styles.chargeTitle}>{charge.title}</Text>
          <View style={[styles.status, isPaid && styles.statusPaid]}>
            <Text style={[styles.statusText, isPaid && styles.statusTextPaid]}>
              {statusCopy[charge.status] ?? charge.status}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.chargeMeta}>
          {charge.origin === "PRESENCIAL" ? charge.merchant?.name ?? "Venda local" : "Venda autonoma"} · {createdAt}
        </Text>
        <Text numberOfLines={1} style={styles.customer}>
          {charge.customer ? `Cliente: ${charge.customer.name}` : isActive ? "Aguardando leitura do cliente" : "Sem cliente pagador"}
        </Text>
        <View style={styles.chargeFooter}>
          <Text style={styles.amount}>{formatarDinheiro(charge.amountCents)}</Text>
          <Text style={styles.origin}>{charge.origin === "PRESENCIAL" ? "Local" : "Autonoma"}</Text>
          {isActive ? (
            <View style={styles.qrAction}>
              {loading ? <ActivityIndicator color={colors.primaryDark} size="small" /> : <Text style={styles.qrActionText}>Ver QR</Text>}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  chargeCard: { alignItems: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md, ...shadowSoft },
  chargeCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  chargeFooter: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  chargeIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  chargeIconPaid: { backgroundColor: colors.primaryDark },
  chargeMeta: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  chargeTitle: { color: colors.textPrimary, flex: 1, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  chargeTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  customer: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  empty: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.xl },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19, textAlign: "center" },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.label, fontWeight: "700" },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  filter: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, minHeight: 36, paddingHorizontal: spacing.md },
  filterActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", lineHeight: 34 },
  filterTextActive: { color: colors.card },
  filters: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  heading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headingCopy: { flex: 1, gap: 3, minWidth: 0 },
  headingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  kicker: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800", textTransform: "uppercase" },
  list: { gap: spacing.md },
  loading: { alignItems: "center", gap: spacing.sm, padding: spacing.xxl },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  origin: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  pressed: { opacity: 0.78 },
  qrAction: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, justifyContent: "center", marginLeft: "auto", minHeight: 28, minWidth: 58, paddingHorizontal: spacing.sm },
  qrActionText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  refresh: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  status: { backgroundColor: colors.cardMuted, borderRadius: radius.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusPaid: { backgroundColor: colors.primarySoft },
  statusText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  statusTextPaid: { color: colors.primaryDark },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19 },
  summary: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", padding: spacing.md },
  summaryDivider: { backgroundColor: colors.primaryLight, height: 34, width: 1 },
  summaryLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  summaryMetric: { flex: 1, gap: 3, minWidth: 0 },
  summaryValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
});
