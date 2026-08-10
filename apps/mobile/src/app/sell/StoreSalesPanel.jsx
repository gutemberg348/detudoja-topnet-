import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getRealtimeSocket, realtimeEvents } from "../../services/realtime";
import { getStoreGeneratedCharges } from "../../services/seller.api";
import { formatarDataHora } from "../../utils/date";
import { formatarDinheiro } from "../../utils/money";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../../utils/theme";

const filters = [
  { id: "ALL", label: "Todas" },
  { id: "OPEN", label: "Em aberto" },
  { id: "PAGA", label: "Recebidas" },
  { id: "CLOSED", label: "Encerradas" },
];

const statusCopy = {
  ATIVA: "Aguardando pagamento",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
  PAGA: "Recebida",
  PROCESSANDO: "Processando",
};

function isOpenCharge(charge) {
  return ["ATIVA", "PROCESSANDO"].includes(charge.status);
}

function matchesFilter(charge, filter) {
  if (filter === "OPEN") {
    return isOpenCharge(charge);
  }

  if (filter === "CLOSED") {
    return ["CANCELADA", "EXPIRADA"].includes(charge.status);
  }

  return filter === "ALL" || charge.status === filter;
}

function formatDateTime(value) {
  if (!value) {
    return "Data indisponivel";
  }

  return formatarDataHora(value, { incluirAno: true }) || "Data indisponivel";
}

export function StoreSalesPanel({ accessToken, onOpenCharge, store }) {
  const [charges, setCharges] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [summary, setSummary] = useState(null);

  const loadCharges = useCallback(async ({ append = false, cursor: requestedCursor = null, silent = false } = {}) => {
    if (!accessToken || !store?.id) {
      return;
    }

    const cursor = append ? requestedCursor : null;

    if (!silent) {
      setError("");
      append ? setLoadingMore(true) : setLoading(true);
    }

    try {
      const response = await getStoreGeneratedCharges(accessToken, store.id, cursor);
      const receivedCharges = response.charges ?? [];

      setCharges((current) => {
        if (!append) {
          return receivedCharges;
        }

        const existingIds = new Set(current.map((charge) => charge.id));
        return [...current, ...receivedCharges.filter((charge) => !existingIds.has(charge.id))];
      });
      setNextCursor(response.nextCursor ?? null);
      setSummary(response.summary ?? null);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar as vendas da loja.");
    } finally {
      if (!silent) {
        append ? setLoadingMore(false) : setLoading(false);
      }
    }
  }, [accessToken, store?.id]);

  useEffect(() => {
    setCharges([]);
    setNextCursor(null);
    setSummary(null);
    setFilter("ALL");
    loadCharges();
  }, [loadCharges, store?.id]);

  useEffect(() => {
    if (!accessToken || !store?.id) {
      return undefined;
    }

    const socket = getRealtimeSocket(accessToken);
    const refreshOnStoreCharge = (payload = {}) => {
      if (Number(payload.storeId) === Number(store.id)) {
        loadCharges({ silent: true });
      }
    };

    socket?.on(realtimeEvents.chargeUpdated, refreshOnStoreCharge);

    return () => {
      socket?.off(realtimeEvents.chargeUpdated, refreshOnStoreCharge);
    };
  }, [accessToken, loadCharges, store?.id]);

  const visibleCharges = useMemo(
    () => charges.filter((charge) => matchesFilter(charge, filter)),
    [charges, filter],
  );

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons color={colors.primaryDark} name="bar-chart-outline" size={20} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Financeiro da loja</Text>
          <Text style={styles.subtitle}>
            Confira pagamentos, cobrancas abertas e tentativas encerradas desta loja.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Atualizar vendas da loja"
          onPress={() => loadCharges()}
          style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}
        >
          <Ionicons color={colors.primaryDark} name="refresh" size={18} />
        </Pressable>
      </View>

      <View style={styles.revenueHero}>
        <View style={styles.revenueCopy}>
          <Text style={styles.revenueLabel}>Receita confirmada por QR</Text>
          <Text style={styles.revenueValue}>{formatarDinheiro(summary?.paidCents ?? 0)}</Text>
          <Text style={styles.revenueMeta}>
            {summary?.paidCount ?? 0} venda{summary?.paidCount === 1 ? "" : "s"} recebida{summary?.paidCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.revenueIcon}>
          <Ionicons color={colors.card} name="trending-up-outline" size={25} />
        </View>
      </View>

      <View style={styles.summary}>
        <SalesMetric
          icon="time-outline"
          label="Em aberto"
          value={`${summary?.activeCount ?? 0} cobranca${summary?.activeCount === 1 ? "" : "s"}`}
        />
        <SalesMetric
          icon="receipt-outline"
          label="Geradas"
          value={String(summary?.totalCount ?? 0)}
        />
      </View>

      <View style={styles.filterRow}>
        {filters.map((item) => {
          const selected = filter === item.id;

          return (
            <Pressable
              key={item.id}
              onPress={() => setFilter(item.id)}
              style={({ pressed }) => [
                styles.filter,
                selected && styles.filterActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, selected && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryDark} />
          <Text style={styles.loadingText}>Carregando historico financeiro...</Text>
        </View>
      ) : visibleCharges.length ? (
        <View style={styles.list}>
          {visibleCharges.map((charge) => (
            <StoreChargeRow charge={charge} key={charge.id} onOpenCharge={onOpenCharge} />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Ionicons color={colors.textMuted} name="receipt-outline" size={25} />
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>Nenhuma venda neste filtro</Text>
            <Text style={styles.emptyText}>
              As cobrancas criadas pelo QR desta loja ficam registradas aqui.
            </Text>
          </View>
        </View>
      )}

      {nextCursor ? (
        <Pressable
          disabled={loadingMore}
          onPress={() => loadCharges({ append: true, cursor: nextCursor })}
          style={({ pressed }) => [styles.loadMore, pressed && styles.pressed, loadingMore && styles.disabled]}
        >
          {loadingMore ? (
            <ActivityIndicator color={colors.primaryDark} size="small" />
          ) : (
            <>
              <Ionicons color={colors.primaryDark} name="add" size={18} />
              <Text style={styles.loadMoreText}>Carregar vendas anteriores</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function SalesMetric({ icon, label, value }) {
  return (
    <View style={styles.metric}>
      <Ionicons color={colors.primaryDark} name={icon} size={17} />
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StoreChargeRow({ charge, onOpenCharge }) {
  const open = charge.status === "ATIVA";
  const paid = charge.status === "PAGA";
  const statusStyle = paid ? styles.statusPaid : open ? styles.statusOpen : styles.statusClosed;
  const statusTextStyle = paid ? styles.statusTextPaid : open ? styles.statusTextOpen : styles.statusTextClosed;
  const payer = charge.customer?.name ?? (open ? "Aguardando leitura do cliente" : "Sem cliente pagador");

  return (
    <Pressable
      disabled={!open}
      onPress={() => onOpenCharge(charge)}
      style={({ pressed }) => [styles.chargeRow, open && styles.chargeRowOpen, pressed && open && styles.pressed]}
    >
      <View style={[styles.chargeIcon, paid && styles.chargeIconPaid]}>
        <Ionicons
          color={paid ? colors.card : colors.primaryDark}
          name={paid ? "checkmark" : open ? "qr-code-outline" : "close-outline"}
          size={20}
        />
      </View>
      <View style={styles.chargeCopy}>
        <View style={styles.chargeTopline}>
          <Text numberOfLines={1} style={styles.chargeTitle}>{charge.title}</Text>
          <Text style={styles.chargeAmount}>{formatarDinheiro(charge.amountCents)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.chargeMeta}>
          {formatDateTime(charge.createdAt)} · {payer}
        </Text>
        <View style={styles.chargeFooter}>
          <View style={[styles.status, statusStyle]}>
            <Text style={[styles.statusText, statusTextStyle]}>
              {statusCopy[charge.status] ?? charge.status}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.chargeCode}>#{charge.code.slice(-8)}</Text>
          {open ? <Text style={styles.openQr}>Reabrir QR</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chargeAmount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  chargeCode: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  chargeCopy: { flex: 1, gap: 5, minWidth: 0 },
  chargeFooter: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  chargeIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  chargeIconPaid: { backgroundColor: colors.primaryDark },
  chargeMeta: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  chargeRow: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  chargeRowOpen: { borderColor: colors.primaryLight },
  chargeTitle: { color: colors.textPrimary, flex: 1, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  chargeTopline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  disabled: { opacity: 0.58 },
  empty: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  emptyCopy: { flex: 1, gap: 3, minWidth: 0 },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  emptyTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small },
  filter: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.round, borderWidth: 1, minHeight: 34, paddingHorizontal: spacing.md },
  filterActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  filterText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", lineHeight: 32 },
  filterTextActive: { color: colors.card },
  header: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 3, minWidth: 0 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  list: { gap: spacing.sm },
  loadMore: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.lg },
  loadMoreText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  loading: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  metric: { flex: 1, gap: 3, minWidth: 0, padding: spacing.sm },
  metricLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  metricValue: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small, fontWeight: "800" },
  openQr: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700", marginLeft: "auto" },
  panel: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.lg, padding: spacing.lg, ...shadowSoft },
  pressed: { opacity: 0.8 },
  refresh: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  revenueCopy: { flex: 1, gap: 3, minWidth: 0 },
  revenueHero: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.lg, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  revenueIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.round, height: 48, justifyContent: "center", width: 48 },
  revenueLabel: { color: "#CDEFE2", fontFamily: fonts.medium, fontSize: typography.caption },
  revenueMeta: { color: "#CDEFE2", fontFamily: fonts.regular, fontSize: typography.caption },
  revenueValue: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.h1, fontWeight: "800" },
  status: { borderRadius: radius.round, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusClosed: { backgroundColor: colors.cardMuted },
  statusOpen: { backgroundColor: "#EFF6FF" },
  statusPaid: { backgroundColor: colors.primarySoft },
  statusText: { fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  statusTextClosed: { color: colors.textSecondary },
  statusTextOpen: { color: colors.info },
  statusTextPaid: { color: colors.primaryDark },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  summary: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
});
