import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { PageHeader } from "../components/PageHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { PayoutAccountModal } from "./sell/PayoutAccountModal";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { ApiError } from "../services/api";
import {
  cancelWithdrawal,
  createWithdrawal,
  getWithdrawalOverview,
  getWithdrawalPixAccount,
  saveWithdrawalPixAccount,
} from "../services/withdrawals.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

const statusLabels = {
  APROVADO: "Aprovado",
  CANCELADO: "Cancelado",
  EM_ANALISE: "Em analise",
  EM_RECONCILIACAO: "Conferindo envio",
  FALHOU: "Falhou",
  PAGO: "Pago",
  PROCESSANDO: "Enviando Pix",
  RECUSADO: "Recusado",
  SOLICITADO: "Aguardando analise",
};

const initialAccountForm = {
  key: "",
  keyType: "CPF",
};

function parseMoney(value) {
  const clean = String(value ?? "").replace(/[^\d,.]/g, "");
  const separator = Math.max(clean.lastIndexOf(","), clean.lastIndexOf("."));
  const normalized =
    separator >= 0
      ? `${clean.slice(0, separator).replace(/\D/g, "")}.${clean
          .slice(separator + 1)
          .replace(/\D/g, "")
          .slice(0, 2)}`
      : clean.replace(/\D/g, "");
  return Math.round((Number(normalized) || 0) * 100);
}

function requestKey() {
  return `withdrawal-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function WithdrawalScreen() {
  const { session } = useAuthStore();
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [accountError, setAccountError] = useState("");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const [sourceAmounts, setSourceAmounts] = useState({});
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedWalletCodes, setSelectedWalletCodes] = useState([]);
  const idempotencyKeyRef = useRef(requestKey());

  const load = useCallback(async () => {
    if (!session?.accessToken) return;
    setError("");
    try {
      const response = await getWithdrawalOverview(session.accessToken);
      setData(response);
      setSelectedWalletCodes((current) => {
        const available = new Set(
          response.wallets.map((wallet) => wallet.code),
        );
        const persisted = current.filter((code) => available.has(code));
        return persisted.length
          ? persisted
          : response.wallets[0]
            ? [response.wallets[0].code]
            : [];
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar os saques.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getRealtimeSocket(session?.accessToken);
    if (!socket) return undefined;
    socket.on(realtimeEvents.walletUpdated, load);
    return () => socket.off(realtimeEvents.walletUpdated, load);
  }, [load, session?.accessToken]);

  const selectedWallets = (data?.wallets ?? []).filter((wallet) =>
    selectedWalletCodes.includes(wallet.code),
  );
  const walletSources = selectedWallets.map((wallet) => ({
    amountCents: parseMoney(sourceAmounts[wallet.code]),
    walletCode: wallet.code,
  }));
  const amountCents = walletSources.reduce(
    (total, source) => total + source.amountCents,
    0,
  );
  const netCents = Math.max(
    amountCents - Number(data?.settings.fixedFeeCents ?? 0),
    0,
  );
  const canSubmit = Boolean(
    data?.settings.enabled &&
    data?.account?.status === "ATIVA" &&
    walletSources.length &&
    walletSources.every((source) => source.amountCents > 0) &&
    amountCents >= data.settings.minimumCents &&
    amountCents <= data.settings.maximumCents &&
    selectedWallets.every(
      (wallet) =>
        parseMoney(sourceAmounts[wallet.code]) <= wallet.availableCents,
    ),
  );

  function toggleWallet(walletCode) {
    setSelectedWalletCodes((current) =>
      current.includes(walletCode)
        ? current.filter((code) => code !== walletCode)
        : [...current, walletCode],
    );
  }

  async function openAccount(skipCpfGate = false) {
    if (!skipCpfGate && session?.user?.cpfRequired) {
      setCpfModalOpen(true);
      return;
    }
    setAccountError("");
    try {
      const response = await getWithdrawalPixAccount(session.accessToken);
      setAccountForm((current) => ({
        ...current,
        keyType: response.account?.keyType ?? current.keyType,
      }));
    } catch {}
    setAccountModalOpen(true);
  }

  async function saveAccount() {
    setIsSavingAccount(true);
    setAccountError("");
    try {
      await saveWithdrawalPixAccount(session.accessToken, accountForm);
      setAccountModalOpen(false);
      await load();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 428) {
        setAccountModalOpen(false);
        setCpfModalOpen(true);
        setAccountError("");
        return;
      }
      setAccountError(
        requestError.message ?? "Nao foi possivel salvar a chave Pix.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await createWithdrawal(session.accessToken, {
        amountCents,
        idempotencyKey: idempotencyKeyRef.current,
        walletSources,
      });
      idempotencyKeyRef.current = requestKey();
      setSourceAmounts({});
      await load();
      if (["FALHOU", "CANCELADO"].includes(response.withdrawal?.status)) {
        setError("O Pix nao foi enviado. Todo o valor voltou para o seu saldo; confira a chave antes de tentar novamente.");
      }
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel solicitar o saque.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancel(item) {
    setError("");
    try {
      await cancelWithdrawal(session.accessToken, item.id);
      await load();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cancelar o saque.");
    }
  }

  if (isLoading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
        <Text style={styles.helper}>Carregando saques...</Text>
      </View>
    );
  }

  return (
    <ScreenContainer
      contentContainerStyle={styles.content}
      edges={["left", "right"]}
    >
      <PageHeader
        eyebrow="Transferencias"
        subtitle="Retire saldos permitidos para sua chave Pix."
        title="Sacar saldo"
      />

      <View style={styles.accountCard}>
        <View style={styles.accountIcon}>
          <Ionicons color={colors.primaryDark} name="key-outline" size={22} />
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountLabel}>Chave de destino</Text>
          <Text style={styles.accountValue}>
            {data?.account?.keyMasked ?? "Nenhuma chave cadastrada"}
          </Text>
          <Text style={styles.accountMeta}>
            {data?.account
              ? data.account.status === "ATIVA"
                ? `${data.account.keyType} - ${data.account.holderName}`
                : "Edite a chave para deixa-la pronta para uso."
              : "Cadastre a chave que deseja usar nos saques."}
          </Text>
        </View>
        <Pressable onPress={openAccount} style={styles.editAccount}>
          <Ionicons
            color={colors.primaryDark}
            name="create-outline"
            size={19}
          />
        </Pressable>
      </View>

      <View style={styles.formCard}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>De onde deseja sacar?</Text>
            <Text style={styles.sectionHint}>
              Selecione uma ou mais carteiras e informe quanto usar de cada uma.
            </Text>
          </View>
          <Text style={styles.step}>
            {selectedWallets.length} selecionada
            {selectedWallets.length === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.walletList}>
          {data?.wallets.map((wallet) => {
            const selected = selectedWalletCodes.includes(wallet.code);
            return (
              <View
                key={wallet.id}
                style={[
                  styles.walletOption,
                  selected && styles.walletOptionSelected,
                ]}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleWallet(wallet.code)}
                  style={styles.walletToggle}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected && styles.checkboxSelected,
                    ]}
                  >
                    {selected ? (
                      <Ionicons
                        color={colors.card}
                        name="checkmark"
                        size={14}
                      />
                    ) : null}
                  </View>
                  <View style={styles.walletCopy}>
                    <Text style={styles.walletName}>{wallet.name}</Text>
                    <Text style={styles.walletAvailable}>
                      Disponivel {formatarDinheiro(wallet.availableCents)}
                    </Text>
                  </View>
                  <Ionicons
                    color={selected ? colors.primaryDark : colors.textMuted}
                    name={
                      selected ? "remove-circle-outline" : "add-circle-outline"
                    }
                    size={20}
                  />
                </Pressable>
                {selected ? (
                  <View style={styles.sourceAmount}>
                    <Text style={styles.sourceAmountLabel}>
                      Usar desta carteira
                    </Text>
                    <View style={styles.sourceInputWrap}>
                      <Text style={styles.sourceCurrency}>R$</Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        onChangeText={(value) =>
                          setSourceAmounts((current) => ({
                            ...current,
                            [wallet.code]: value,
                          }))
                        }
                        placeholder="0,00"
                        placeholderTextColor={colors.textMuted}
                        style={styles.sourceInput}
                        value={sourceAmounts[wallet.code] ?? ""}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.divider} />
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Resumo do saque</Text>
          <Text style={styles.step}>Valor total</Text>
        </View>
        <View style={styles.moneyField}>
          <Text style={styles.currency}>R$</Text>
          <Text style={styles.moneyValue}>
            {formatarDinheiro(amountCents).replace("R$", "").trim()}
          </Text>
        </View>
        <Text style={styles.limits}>
          Minimo {formatarDinheiro(data?.settings.minimumCents)} - maximo{" "}
          {formatarDinheiro(data?.settings.maximumCents)} - limite diario{" "}
          {formatarDinheiro(data?.settings.dailyLimitCents)}
        </Text>

        <View style={styles.summary}>
          <SummaryRow
            label="Valor solicitado"
            value={formatarDinheiro(amountCents)}
          />
          <SummaryRow
            label="Taxa fixa"
            value={`- ${formatarDinheiro(data?.settings.fixedFeeCents)}`}
          />
          <View style={styles.summaryDivider} />
          <SummaryRow
            emphasis
            label="Voce recebe"
            value={formatarDinheiro(netCents)}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!data?.settings.enabled ? (
          <Text style={styles.warning}>
            Novos saques estao temporariamente pausados.
          </Text>
        ) : null}
        <AppButton
          disabled={!canSubmit}
          icon="arrow-up-circle-outline"
          loading={isSubmitting}
          onPress={submit}
          title={
            data?.settings.manualApproval ? "Solicitar saque" : "Sacar agora"
          }
        />
        <View style={styles.security}>
          <Ionicons
            color={colors.primaryDark}
            name="shield-checkmark-outline"
            size={17}
          />
          <Text style={styles.securityText}>
            O valor bruto fica reservado e nao pode ser usado duas vezes.
          </Text>
        </View>
      </View>

      <View style={styles.historySection}>
        <View style={styles.historyHeading}>
          <View>
            <Text style={styles.sectionTitle}>Historico</Text>
            <Text style={styles.helper}>
              Acompanhe analise, envio e confirmacao.
            </Text>
          </View>
          <Text style={styles.count}>{data?.withdrawals.length ?? 0}</Text>
        </View>
        {data?.withdrawals.length ? (
          data.withdrawals.map((item) => (
            <WithdrawalRow
              item={item}
              key={item.id}
              onCancel={() => cancel(item)}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <Ionicons
              color={colors.textMuted}
              name="receipt-outline"
              size={25}
            />
            <Text style={styles.emptyTitle}>Nenhum saque solicitado</Text>
            <Text style={styles.helper}>Suas retiradas aparecerao aqui.</Text>
          </View>
        )}
      </View>

      <PayoutAccountModal
        error={accountError}
        existingAccount={data?.account}
        form={accountForm}
        isSaving={isSavingAccount}
        onChange={setAccountForm}
        onClose={() => setAccountModalOpen(false)}
        onSubmit={saveAccount}
        open={accountModalOpen}
        purpose="withdrawal"
        userNeedsCpf={Boolean(session?.user?.cpfRequired)}
      />
      <CpfRequirementModal
        onClose={() => setCpfModalOpen(false)}
        onCompleted={() => {
          setCpfModalOpen(false);
          void openAccount(true);
        }}
        open={cpfModalOpen}
        reason="sale"
      />
    </ScreenContainer>
  );
}

function SummaryRow({ emphasis = false, label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, emphasis && styles.summaryEmphasis]}>
        {label}
      </Text>
      <Text
        style={[styles.summaryValue, emphasis && styles.summaryValueEmphasis]}
      >
        {value}
      </Text>
    </View>
  );
}

function WithdrawalRow({ item, onCancel }) {
  const pending = ["SOLICITADO", "EM_ANALISE"].includes(item.status);
  const success = item.status === "PAGO";
  const danger = ["RECUSADO", "CANCELADO", "FALHOU"].includes(item.status);
  return (
    <View style={styles.historyCard}>
      <View
        style={[
          styles.historyIcon,
          success && styles.historyIconSuccess,
          danger && styles.historyIconDanger,
        ]}
      >
        <Ionicons
          color={
            success ? colors.card : danger ? colors.danger : colors.primaryDark
          }
          name={success ? "checkmark" : danger ? "close" : "time-outline"}
          size={19}
        />
      </View>
      <View style={styles.historyCopy}>
        <Text style={styles.historyAmount}>
          {formatarDinheiro(item.netAmountCents)}
        </Text>
        <Text style={styles.historyMeta}>
          {item.wallet.name} - taxa {formatarDinheiro(item.feeCents)}
        </Text>
        <Text style={styles.historyDate}>
          {new Date(item.createdAt).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </Text>
        {item.failureReason ? (
          <Text style={styles.failure}>{item.failureReason}</Text>
        ) : null}
      </View>
      <View style={styles.historyAside}>
        <Text
          style={[
            styles.status,
            success && styles.statusSuccess,
            danger && styles.statusDanger,
          ]}
        >
          {statusLabels[item.status] ?? item.status}
        </Text>
        {pending ? (
          <Pressable onPress={onCancel}>
            <Text style={styles.cancel}>Cancelar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    ...shadowSoft,
  },
  accountCopy: { flex: 1, gap: 2, minWidth: 0 },
  accountIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  accountLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  accountMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 10,
  },
  accountValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  cancel: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
  },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl },
  count: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 11,
    minWidth: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    textAlign: "center",
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxSelected: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  currency: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  divider: { backgroundColor: colors.border, height: 1 },
  editAccount: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  empty: { alignItems: "center", gap: spacing.xs, padding: spacing.xl },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  failure: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 3,
  },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadowSoft,
  },
  helper: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  historyAmount: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  historyAside: { alignItems: "flex-end", gap: spacing.sm },
  historyCard: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  historyCopy: { flex: 1, gap: 2, minWidth: 0 },
  historyDate: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 9,
  },
  historyHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  historyIconDanger: { backgroundColor: colors.dangerSoft },
  historyIconSuccess: { backgroundColor: colors.primaryDark },
  historyMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 10,
  },
  historySection: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  limits: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 16,
  },
  moneyField: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
  },
  moneyValue: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 30,
    fontWeight: "800",
    minWidth: 0,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionHint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
    maxWidth: 290,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  security: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  securityText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 10,
  },
  status: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.round,
    color: "#8A5A00",
    fontFamily: fonts.bold,
    fontSize: 9,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusDanger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  statusSuccess: {
    backgroundColor: colors.primarySoft,
    color: colors.primaryDark,
  },
  step: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 9 },
  summary: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  summaryDivider: { backgroundColor: colors.border, height: 1 },
  summaryEmphasis: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontWeight: "800",
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  summaryValueEmphasis: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  walletAvailable: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 10,
  },
  walletCopy: { flex: 1, gap: 2 },
  walletList: { gap: spacing.sm },
  walletName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  walletOption: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  walletOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
  },
  walletToggle: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sourceAmount: {
    borderTopColor: colors.primaryLight,
    borderTopWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  sourceAmountLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  sourceCurrency: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
  },
  sourceInput: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    minWidth: 0,
    paddingVertical: 0,
  },
  sourceInputWrap: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  warning: {
    color: "#8A5A00",
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
});
