import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { LocalRewardNotice } from "../components/LocalRewardNotice";
import { PaymentFeedbackOverlay } from "../components/PaymentFeedbackOverlay";
import { ScreenContainer } from "../components/ScreenContainer";
import { getCharge, getPermanentStoreQr, payCharge, payPermanentStoreQr } from "../services/charges.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useWalletStore } from "../stores/useWalletStore";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

function moneyInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 9);
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function inputToCents(value) {
  return Number(String(value ?? "").replace(/\D/g, "")) || 0;
}

function newIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function ChargePaymentScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const { refresh: refreshWallets, wallets } = useWalletStore();
  const [charge, setCharge] = useState(null);
  const [permanentStore, setPermanentStore] = useState(null);
  const [amount, setAmount] = useState("");
  const [useBalance, setUseBalance] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());
  const code = route.params?.code;
  const storeQrToken = route.params?.storeQrToken;
  const isPermanentQr = Boolean(storeQrToken);
  const returnToServiceConversation = route.params?.returnToServiceConversation === true;
  const availableCents = useMemo(
    () => wallets.filter((wallet) => wallet.canUseForPurchase).reduce((total, wallet) => total + Number(wallet.availableCents ?? 0), 0),
    [wallets],
  );
  const amountCents = isPermanentQr ? inputToCents(amount) : Number(charge?.amountCents ?? 0);
  const walletCents = useBalance ? Math.min(availableCents, amountCents) : 0;
  const pixCents = Math.max(0, amountCents - walletCents);

  const loadPaymentTarget = useCallback(async () => {
    if (!session?.accessToken || (!code && !storeQrToken)) {
      setError("Codigo de pagamento invalido.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      if (storeQrToken) {
        const response = await getPermanentStoreQr(session.accessToken, storeQrToken);
        setPermanentStore(response.store);
      } else {
        const response = await getCharge(session.accessToken, code);
        setCharge(response.charge);
      }
      await refreshWallets();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar o pagamento.");
    } finally {
      setIsLoading(false);
    }
  }, [code, refreshWallets, session?.accessToken, storeQrToken]);

  useEffect(() => { loadPaymentTarget(); }, [loadPaymentTarget]);

  async function confirmPayment({ skipCpfGate = false } = {}) {
    if (!session?.accessToken || isPaying || amountCents < 100) return;
    if (!skipCpfGate && session.user?.cpfRequired) {
      setCpfModalOpen(true);
      return;
    }
    setIsPaying(true);
    setError("");
    setPaymentFeedback({ status: "processing" });
    try {
      const response = isPermanentQr
        ? await payPermanentStoreQr(session.accessToken, storeQrToken, {
            amountCents,
            idempotencyKey: idempotencyKey.current,
            useBalance,
          })
        : await payCharge(session.accessToken, charge.code, { useBalance });
      setCharge(response.charge);
      refreshWallets().catch(() => {});
      if (response.gatewayPayment) {
        setPaymentFeedback(null);
        navigation.replace("GatewayPixPayment", {
          charge: response.charge,
          gatewayPayment: response.gatewayPayment,
          paymentBreakdown: response.paymentBreakdown,
          store: response.charge?.merchant,
        });
        return;
      }
      setPaymentFeedback({
        message: `${formatarDinheiro(response.charge.amountCents)} pago com sucesso.`,
        status: "success",
      });
      idempotencyKey.current = newIdempotencyKey();
    } catch (requestError) {
      const message = requestError.message ?? "Nao foi possivel iniciar o pagamento.";
      if (
        requestError.data?.details?.code === "PAYMENT_ATTEMPT_FINAL_FAILURE"
        && requestError.data.details.retryWithNewKey === true
      ) {
        idempotencyKey.current = newIdempotencyKey();
      }
      setError(message);
      setPaymentFeedback({ message, status: "error" });
    } finally {
      setIsPaying(false);
    }
  }

  if (isLoading) return <LoadingState />;
  if (!charge && !permanentStore) {
    return (
      <View style={styles.errorState}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
        <Text style={styles.errorText}>{error || "Pagamento nao encontrado."}</Text>
        <AppButton icon="refresh-outline" onPress={loadPaymentTarget} title="Tentar novamente" />
      </View>
    );
  }

  const merchant = charge?.merchant ?? {
    id: permanentStore.id,
    logoUrl: permanentStore.logoUrl,
    name: permanentStore.name,
    type: "STORE",
  };
  const merchantLogo = resolveMediaUrl(merchant.logoUrl);
  const paid = charge?.status === "PAGA";
  const canPay = !paid && amountCents >= 100 && (isPermanentQr || charge?.status === "ATIVA");

  function requestPaymentConfirmation() {
    if (!canPay || isPaying) return;
    if (isPermanentQr) {
      setConfirmationOpen(true);
      return;
    }
    confirmPayment();
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, paid && styles.headerIconPaid]}>
          <Ionicons color={paid ? colors.card : colors.primaryDark} name={paid ? "checkmark" : "shield-checkmark-outline"} size={25} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{paid ? "Pagamento confirmado" : isPermanentQr ? "QR oficial da loja" : "Confirme antes de pagar"}</Text>
          <Text style={styles.title}>{paid ? "Pagamento concluido" : "Pagamento seguro"}</Text>
        </View>
      </View>

      <View style={styles.merchantCard}>
        <View style={styles.logoShell}>
          {merchantLogo ? <Image source={{ uri: merchantLogo }} style={styles.logo} /> : <Ionicons color={colors.primaryDark} name="storefront-outline" size={25} />}
        </View>
        <View style={styles.merchantCopy}>
          <Text style={styles.merchantLabel}>Voce esta pagando para</Text>
          <Text numberOfLines={2} style={styles.merchantName}>{merchant.name}</Text>
          <Text style={styles.merchantMeta}>Recebedor verificado pela plataforma</Text>
        </View>
        <Ionicons color={colors.success} name="checkmark-circle" size={22} />
      </View>

      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>{isPermanentQr ? "Informe o valor da compra" : charge.title}</Text>
        {charge?.description ? <Text style={styles.amountDescription}>{charge.description}</Text> : null}
        {isPermanentQr && !paid ? (
          <View style={styles.amountInputRow}>
            <Text style={styles.currency}>R$</Text>
            <TextInput
              autoFocus
              keyboardType="decimal-pad"
              onChangeText={(value) => { setAmount(moneyInput(value)); setError(""); setConfirmationOpen(false); }}
              placeholder="0,00"
              placeholderTextColor="#83AD9E"
              style={styles.amountInput}
              value={amount}
            />
          </View>
        ) : <Text style={styles.amount}>{formatarDinheiro(amountCents)}</Text>}
        <Text style={styles.amountMeta}>Confira o valor com a loja antes de continuar.</Text>
      </View>

      {!paid && amountCents >= 100 ? (
        <>
          <View style={styles.balanceCard}>
            <View style={styles.balanceIcon}><Ionicons color={colors.primaryDark} name="wallet-outline" size={22} /></View>
            <View style={styles.balanceCopy}>
              <Text style={styles.balanceTitle}>Usar saldo da carteira</Text>
              <Text style={styles.balanceText}>Disponivel: {formatarDinheiro(availableCents)}</Text>
            </View>
            <Switch
              accessibilityLabel="Usar saldo da carteira"
              ios_backgroundColor={colors.border}
              onValueChange={setUseBalance}
              thumbColor={colors.card}
              trackColor={{ false: colors.border, true: colors.primary }}
              value={useBalance}
            />
          </View>
          <View style={styles.breakdownCard}>
            <PaymentLine label="Saldo Brasil Cashback" value={walletCents} />
            <PaymentLine emphasize label={pixCents > 0 ? "Pix a gerar" : "Pix"} value={pixCents} />
            <View style={styles.divider} />
            <PaymentLine bold label="Total" value={amountCents} />
          </View>
          {pixCents > 0 ? (
            <View style={styles.notice}>
              <Ionicons color={colors.primaryDark} name="information-circle-outline" size={20} />
              <Text style={styles.noticeText}>{walletCents > 0 ? "Seu saldo sera reservado agora e o Pix sera gerado somente para o restante." : "O pagamento sera feito integralmente por Pix."}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {charge?.localRewardPolicy ? <LocalRewardNotice policy={charge.localRewardPolicy} /> : null}
      {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      {paid ? (
        <AppButton
          icon={returnToServiceConversation ? "chatbubble-ellipses-outline" : "checkmark-circle-outline"}
          onPress={() => returnToServiceConversation ? navigation.goBack() : navigation.popToTop()}
          title={returnToServiceConversation ? "Voltar para a conversa" : "Voltar ao inicio"}
        />
      ) : (
        <AppButton
          disabled={!canPay || isPaying}
          icon={pixCents > 0 ? "qr-code-outline" : "lock-closed-outline"}
          loading={isPaying}
          onPress={requestPaymentConfirmation}
          style={styles.payButton}
          title={pixCents > 0 ? `Gerar Pix de ${formatarDinheiro(pixCents)}` : `Pagar ${formatarDinheiro(amountCents)}`}
        />
      )}

      <CpfRequirementModal
        onClose={() => setCpfModalOpen(false)}
        onCompleted={() => { setCpfModalOpen(false); confirmPayment({ skipCpfGate: true }); }}
        open={cpfModalOpen}
        reason="purchase"
      />
      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmationOpen(false)}
        transparent
        visible={confirmationOpen}
      >
        <View style={styles.confirmOverlay}>
          <Pressable onPress={() => setConfirmationOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={27} />
            </View>
            <Text style={styles.confirmKicker}>CONFIRME COM A LOJA</Text>
            <Text style={styles.confirmTitle}>{merchant.name}</Text>
            <Text style={styles.confirmAmount}>{formatarDinheiro(amountCents)}</Text>
            <Text style={styles.confirmText}>
              Confira o valor no caixa. Depois de confirmar, o saldo sera reservado e o Pix sera criado somente para o restante.
            </Text>
            <View style={styles.confirmBreakdown}>
              <PaymentLine label="Saldo utilizado" value={walletCents} />
              <PaymentLine label="Pix a gerar" value={pixCents} />
            </View>
            <AppButton
              icon={pixCents > 0 ? "qr-code-outline" : "lock-closed-outline"}
              onPress={() => {
                setConfirmationOpen(false);
                confirmPayment();
              }}
              title={`Confirmar pagamento de ${formatarDinheiro(amountCents)}`}
            />
            <AppButton onPress={() => setConfirmationOpen(false)} title="Corrigir valor" variant="outline" />
          </View>
        </View>
      </Modal>
      <PaymentFeedbackOverlay
        amountCents={amountCents}
        counterparty={merchant.name}
        message={paymentFeedback?.message}
        onDismiss={() => setPaymentFeedback(null)}
        onFinished={() => setPaymentFeedback(null)}
        status={paymentFeedback?.status}
        visible={Boolean(paymentFeedback)}
      />
    </ScreenContainer>
  );
}

function PaymentLine({ bold = false, emphasize = false, label, value }) {
  return (
    <View style={styles.paymentLine}>
      <Text style={[styles.paymentLabel, bold && styles.paymentBold]}>{label}</Text>
      <Text style={[styles.paymentValue, bold && styles.paymentBold, emphasize && value > 0 && styles.paymentEmphasize]}>{formatarDinheiro(value)}</Text>
    </View>
  );
}

function LoadingState() {
  return <View style={styles.errorState}><ActivityIndicator color={colors.primaryDark} size="large" /><Text style={styles.loadingText}>Conferindo pagamento...</Text></View>;
}

const styles = StyleSheet.create({
  amount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 38, fontWeight: "800", marginTop: spacing.md },
  amountCard: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.xl, borderWidth: 1, gap: spacing.xs, padding: spacing.xl },
  amountDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19 },
  amountInput: { color: colors.primaryDark, flex: 1, fontFamily: fonts.extraBold, fontSize: 40, fontWeight: "800", minWidth: 0, paddingVertical: spacing.sm },
  amountInputRow: { alignItems: "center", borderBottomColor: colors.primary, borderBottomWidth: 2, flexDirection: "row", gap: spacing.sm, marginVertical: spacing.sm },
  amountLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  amountMeta: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  balanceCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  balanceCopy: { flex: 1, gap: 3 },
  balanceIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  balanceText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption },
  balanceTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  breakdownCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  content: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  confirmAmount: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 34, textAlign: "center" },
  confirmBreakdown: { alignSelf: "stretch", backgroundColor: colors.cardMuted, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md },
  confirmCard: { alignItems: "stretch", backgroundColor: colors.card, borderRadius: radius.xl, gap: spacing.md, maxWidth: 420, padding: spacing.xl, width: "92%", ...shadow },
  confirmIcon: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 58, justifyContent: "center", width: 58 },
  confirmKicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textAlign: "center" },
  confirmOverlay: { alignItems: "center", backgroundColor: "rgba(8, 24, 18, 0.58)", flex: 1, justifyContent: "center", padding: spacing.lg },
  confirmText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  confirmTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, textAlign: "center" },
  currency: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.h2, fontWeight: "700" },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: spacing.xs },
  errorInline: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  errorState: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  errorText: { color: colors.textSecondary, fontFamily: fonts.medium, textAlign: "center" },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 50, justifyContent: "center", width: 50 },
  headerIconPaid: { backgroundColor: colors.primaryDark },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium },
  logo: { height: 52, width: 52 },
  logoShell: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 56, justifyContent: "center", overflow: "hidden", width: 56 },
  merchantCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.xl, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg, ...shadow },
  merchantCopy: { flex: 1, gap: 2, minWidth: 0 },
  merchantLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: typography.caption },
  merchantMeta: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  merchantName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  notice: { alignItems: "flex-start", backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  noticeText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19 },
  payButton: { minHeight: 58, width: "100%" },
  paymentBold: { color: colors.textPrimary, fontFamily: fonts.bold, fontWeight: "700" },
  paymentEmphasize: { color: colors.primaryDark },
  paymentLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  paymentLine: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  paymentValue: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: typography.small },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, fontWeight: "800" },
});
