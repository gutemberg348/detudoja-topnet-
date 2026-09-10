import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { LocalRewardNotice } from "../components/LocalRewardNotice";
import { PaymentFeedbackOverlay } from "../components/PaymentFeedbackOverlay";
import { ScreenContainer } from "../components/ScreenContainer";
import { getCharge, payChargeWithWallet } from "../services/charges.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useWalletStore } from "../stores/useWalletStore";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function ChargePaymentScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const { refresh: refreshWallets, wallets } = useWalletStore();
  const [charge, setCharge] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const code = route.params?.code;
  const returnToServiceConversation = route.params?.returnToServiceConversation === true;
  const availableCents = useMemo(
    () => wallets.filter((wallet) => wallet.canUseForPurchase).reduce((total, wallet) => total + Number(wallet.availableCents ?? 0), 0),
    [wallets],
  );

  const loadCharge = useCallback(async () => {
    if (!session?.accessToken || !code) {
      setError("Codigo de cobranca invalido.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await getCharge(session.accessToken, code);
      setCharge(response.charge);
      await refreshWallets();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar a cobranca.");
    } finally {
      setIsLoading(false);
    }
  }, [code, refreshWallets, session?.accessToken]);

  useEffect(() => {
    loadCharge();
  }, [loadCharge]);

  async function confirmPayment({ skipCpfGate = false } = {}) {
    if (!session?.accessToken || !charge || isPaying) {
      return;
    }

    if (!skipCpfGate && session.user?.cpfRequired) {
      setCpfModalOpen(true);
      return;
    }

    setIsPaying(true);
    setError("");
    setPaymentFeedback({ status: "processing" });

    try {
      const response = await payChargeWithWallet(session.accessToken, charge.code);
      setCharge(response.charge);
      setPaymentFeedback({
        message: `${formatarDinheiro(response.charge.amountCents)} pago com sucesso.`,
        status: "success",
      });
      refreshWallets().catch(() => {});
    } catch (requestError) {
      const message = requestError.message ?? "Nao foi possivel pagar a cobranca.";
      setError(message);
      setPaymentFeedback({
        message,
        status: "error",
      });
    } finally {
      setIsPaying(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!charge) {
    return (
      <View style={styles.errorState}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
        <Text style={styles.errorText}>{error || "Cobranca nao encontrada."}</Text>
        <AppButton icon="refresh-outline" onPress={loadCharge} title="Tentar novamente" />
      </View>
    );
  }

  const paid = charge.status === "PAGA";
  const canPay = charge.status === "ATIVA" && availableCents >= charge.amountCents;
  const merchantLogo = resolveMediaUrl(charge.merchant?.logoUrl);

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, paid && styles.headerIconPaid]}>
          <Ionicons color={paid ? colors.card : colors.primaryDark} name={paid ? "checkmark" : "shield-checkmark-outline"} size={25} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{paid ? "Pagamento confirmado" : "Confirme antes de pagar"}</Text>
          <Text style={styles.title}>{paid ? "Cobranca paga" : "Voce esta pagando"}</Text>
        </View>
      </View>

      <View style={styles.merchantCard}>
        <View style={styles.logoShell}>
          {merchantLogo ? <Image source={{ uri: merchantLogo }} style={styles.logo} /> : <Ionicons color={colors.primaryDark} name={charge.merchant?.type === "STORE" ? "storefront-outline" : "person-outline"} size={25} />}
        </View>
        <View style={styles.merchantCopy}>
          <Text style={styles.merchantLabel}>{charge.merchant?.type === "STORE" ? "Loja" : "Vendedor"}</Text>
          <Text numberOfLines={2} style={styles.merchantName}>{charge.merchant?.name}</Text>
          {charge.merchant?.segment ? <Text style={styles.merchantMeta}>{charge.merchant.segment}</Text> : null}
        </View>
      </View>

      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>{charge.title}</Text>
        {charge.description ? <Text style={styles.amountDescription}>{charge.description}</Text> : null}
        <Text style={styles.amount}>{formatarDinheiro(charge.amountCents)}</Text>
        <View style={styles.divider} />
        <Text style={styles.amountMeta}>{paid ? "Pago com a carteira Brasil Cashback" : `Saldo disponivel: ${formatarDinheiro(availableCents)}`}</Text>
      </View>

      <LocalRewardNotice policy={charge.localRewardPolicy} />

      {error ? <Text style={styles.errorInline}>{error}</Text> : null}

      {paid ? (
        <AppButton
          icon={returnToServiceConversation ? "chatbubble-ellipses-outline" : "checkmark-circle-outline"}
          onPress={() => returnToServiceConversation ? navigation.goBack() : navigation.popToTop()}
          title={returnToServiceConversation ? "Voltar para a conversa" : "Voltar ao inicio"}
        />
      ) : (
        <>
          <AppButton
            disabled={!canPay || isPaying}
            icon="lock-closed-outline"
            loading={isPaying}
            onPress={() => confirmPayment()}
            style={styles.payButton}
            title={`Pagar ${formatarDinheiro(charge.amountCents)}`}
          />
          {!canPay ? <Text style={styles.balanceHint}>Saldo insuficiente. A opcao de complementar por Pix entra quando o gateway for conectado.</Text> : null}
        </>
      )}

      <CpfRequirementModal
        onClose={() => setCpfModalOpen(false)}
        onCompleted={() => {
          setCpfModalOpen(false);
          confirmPayment({ skipCpfGate: true });
        }}
        open={cpfModalOpen}
        reason="purchase"
      />
      <PaymentFeedbackOverlay
        amountCents={charge.amountCents}
        counterparty={charge.merchant?.name}
        message={paymentFeedback?.message}
        onDismiss={() => setPaymentFeedback(null)}
        onFinished={() => setPaymentFeedback(null)}
        status={paymentFeedback?.status}
        visible={Boolean(paymentFeedback)}
      />
    </ScreenContainer>
  );
}

function LoadingState() {
  return <View style={styles.errorState}><ActivityIndicator color={colors.primaryDark} size="large" /><Text style={styles.loadingText}>Conferindo cobranca...</Text></View>;
}

const styles = StyleSheet.create({
  amount: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 36, fontWeight: "800", marginTop: spacing.md },
  amountCard: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, padding: spacing.xl },
  amountDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19, marginTop: spacing.xs },
  amountLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  amountMeta: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  balanceHint: { color: colors.warning, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19, textAlign: "center" },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  divider: { backgroundColor: colors.primaryLight, height: 1, marginVertical: spacing.md },
  errorInline: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  errorState: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  errorText: { color: colors.textSecondary, fontFamily: fonts.medium, textAlign: "center" },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 50, justifyContent: "center", width: 50 },
  headerIconPaid: { backgroundColor: colors.primaryDark },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.medium },
  logo: { height: 48, width: 48 },
  logoShell: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 52, justifyContent: "center", overflow: "hidden", width: 52 },
  merchantCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg, ...shadow },
  merchantCopy: { flex: 1, gap: 2, minWidth: 0 },
  merchantLabel: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: typography.caption },
  merchantMeta: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  merchantName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  payButton: { minHeight: 58, width: "100%" },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, fontWeight: "800" },
});
