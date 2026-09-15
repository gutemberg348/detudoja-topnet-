import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { PaymentFeedbackOverlay } from "../components/PaymentFeedbackOverlay";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  createCheckoutOrder,
  createOrderIdempotencyKey,
  payCustomerOrderProposal,
} from "../services/orders.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCartStore } from "../stores/useCartStore";
import { useWalletStore } from "../stores/useWalletStore";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

export function CheckoutPaymentScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const { clearCart } = useCartStore();
  const { wallets } = useWalletStore();
  const [useBalance, setUseBalance] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [completedPayment, setCompletedPayment] = useState(null);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const checkoutIdempotencyKeyRef = useRef(null);
  const delivery = route.params?.delivery ?? {};
  const deliveryMode = route.params?.deliveryMode ?? delivery.mode ?? "delivery";
  const items = route.params?.items ?? [];
  const order = route.params?.order ?? null;
  const proposal = route.params?.proposal ?? null;
  const isProposalPayment = route.params?.mode === "order-proposal";
  const store = route.params?.store ?? order?.store ?? null;
  const totals = route.params?.totals ?? { totalCents: 0 };
  const availableBalanceCents = useMemo(
    () =>
      wallets
        .filter((wallet) => wallet.canUseForPurchase)
        .reduce((total, wallet) => total + Number(wallet.availableCents ?? 0), 0),
    [wallets],
  );
  const canPayFullyWithBalance = availableBalanceCents >= totals.totalCents;
  const balanceUsedCents = useBalance && canPayFullyWithBalance ? totals.totalCents : 0;
  const pixComplementCents = Math.max(totals.totalCents - balanceUsedCents, 0);

  async function confirmOrder({ skipCpfGate = false } = {}) {
    if (
      !session?.accessToken
      || (isProposalPayment ? !order?.id || !proposal?.id : !store?.id || !items.length)
    ) {
      return;
    }

    if (!skipCpfGate && session.user?.cpfRequired) {
      setCpfModalOpen(true);
      return;
    }

    setIsSaving(true);
    setError("");
    setPaymentFeedback({ status: "processing" });

    try {
      const paymentData = {
        balanceUsedCents,
        pixComplementCents,
        useBalance,
      };
      const response = isProposalPayment
        ? await payCustomerOrderProposal(
            session.accessToken,
            order.id,
            proposal.id,
            paymentData,
          )
        : await createCheckoutOrder(session.accessToken, {
            address: delivery.address,
            addressId: delivery.addressId,
            deliveryMode,
            items: items.map((item) => ({
              notes: item.notes ?? "",
              productId: item.id,
              quantity: item.quantity,
            })),
            payment: paymentData,
          storeId: store.id,
          }, checkoutIdempotencyKeyRef.current ??= createOrderIdempotencyKey("checkout"));

      if (!isProposalPayment) clearCart();

      if (response.gatewayPayment) {
        navigation.replace("GatewayPixPayment", {
          gatewayPayment: response.gatewayPayment,
          order: response.order,
          store,
        });
        return;
      }

      setCompletedPayment({
        order: response.order,
        payment: response.order?.payment ?? {
          balanceCents: balanceUsedCents,
          pixCents: pixComplementCents,
          totalCents: totals.totalCents,
        },
        store,
      });
      setPaymentFeedback({
        message: `${formatarDinheiro(totals.totalCents)} confirmado com sucesso.`,
        status: "success",
        title: isProposalPayment ? "Proposta paga" : "Pedido confirmado",
      });
    } catch (requestError) {
      const message = requestError.message ?? "Nao foi possivel confirmar o pedido.";
      setError(message);
      setPaymentFeedback({
        message,
        status: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Pagamento</Text>
        <Text style={styles.subtitle}>
          {isProposalPayment
            ? "A proposta foi aceita. Escolha como pagar e volte ao chat para acompanhar."
            : "Pague pelas carteiras ou gere um Pix seguro pelo Asaas."}
        </Text>
      </View>

      <LinearGradient colors={[colors.primaryDark, "#0F766E"]} style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total do pedido</Text>
        <Text style={styles.totalValue}>{formatarDinheiro(totals.totalCents)}</Text>
        <Text style={styles.totalStore}>{store?.name ?? "Loja"}</Text>
      </LinearGradient>

      <View style={styles.panel}>
        <PaymentOption
          active={useBalance && canPayFullyWithBalance}
          icon="wallet-outline"
          label="Usar saldo/carteiras"
          onPress={() => {
            if (canPayFullyWithBalance) {
              setUseBalance((current) => !current);
            }
          }}
          value={
            canPayFullyWithBalance
              ? `Disponivel: ${formatarDinheiro(availableBalanceCents)}`
              : `Disponivel: ${formatarDinheiro(availableBalanceCents)} - use Pix para este pedido`
          }
        />
        <PaymentOption
          active={pixComplementCents > 0}
          icon="qr-code-outline"
          label="Complementar no Pix"
          onPress={() => setUseBalance(false)}
          value={
            pixComplementCents > 0
              ? formatarDinheiro(pixComplementCents)
              : "Nao necessario"
          }
        />
      </View>

      <View style={styles.summary}>
        {Number(totals.serviceFeeCents ?? order?.serviceFeeCents ?? 0) > 0 ? (
          <SummaryRow
            label="Taxa de servico"
            value={formatarDinheiro(totals.serviceFeeCents ?? order?.serviceFeeCents)}
          />
        ) : null}
        <SummaryRow label="Pago com saldo" value={formatarDinheiro(balanceUsedCents)} />
        <SummaryRow label="Complemento Pix" value={formatarDinheiro(pixComplementCents)} />
        <View style={styles.divider} />
        <SummaryRow strong label="Total" value={formatarDinheiro(totals.totalCents)} />
      </View>

      {pixComplementCents > 0 ? (
        <View style={styles.pixHint}>
          <Ionicons color={colors.warning} name="alert-circle-outline" size={20} />
          <Text style={styles.pixHintText}>
            O QR Pix sera criado pelo Asaas. A loja recebe o pedido somente apos a confirmacao.
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <AppButton
        disabled={isSaving || (isProposalPayment ? !proposal?.id : !items.length)}
        icon="checkmark-circle-outline"
        loading={isSaving}
        onPress={() => confirmOrder()}
        title={isProposalPayment ? "Pagar proposta" : "Confirmar pedido"}
      />

      <CpfRequirementModal
        onClose={() => setCpfModalOpen(false)}
        onCompleted={() => {
          setCpfModalOpen(false);
          confirmOrder({ skipCpfGate: true });
        }}
        open={cpfModalOpen}
        reason="purchase"
      />
      <PaymentFeedbackOverlay
        amountCents={totals.totalCents}
        counterparty={store?.name}
        message={paymentFeedback?.message}
        onDismiss={() => setPaymentFeedback(null)}
        onFinished={(status) => {
          if (status === "success" && completedPayment) {
            navigation.navigate("OnlineOrderSuccess", completedPayment);
          }
          setPaymentFeedback(null);
          setCompletedPayment(null);
        }}
        status={paymentFeedback?.status}
        title={paymentFeedback?.title}
        visible={Boolean(paymentFeedback)}
      />
    </ScreenContainer>
  );
}

function PaymentOption({ active, icon, label, onPress, value }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.paymentOption, active && styles.paymentOptionActive]}
    >
      <View style={styles.paymentIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={22} />
      </View>
      <View style={styles.paymentCopy}>
        <Text style={styles.paymentLabel}>{label}</Text>
        <Text style={styles.paymentValue}>{value}</Text>
      </View>
      <Ionicons
        color={active ? colors.primaryDark : colors.textMuted}
        name={active ? "checkmark-circle" : "ellipse-outline"}
        size={22}
      />
    </Pressable>
  );
}

function SummaryRow({ label, strong = false, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: "center",
  },
  header: {
    gap: spacing.xs,
  },
  panel: {
    gap: spacing.md,
  },
  paymentCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  paymentIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  paymentLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  paymentOption: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.md,
    ...shadow,
  },
  paymentOptionActive: {
    borderColor: colors.primary,
  },
  paymentValue: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  pixHint: {
    alignItems: "center",
    backgroundColor: colors.warningSoft,
    borderColor: "#FED7AA",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  pixHintText: {
    color: "#9A3412",
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 22,
  },
  summary: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryStrong: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h1,
    fontWeight: "800",
  },
  totalCard: {
    borderRadius: 24,
    gap: spacing.xs,
    padding: spacing.xl,
    ...shadow,
  },
  totalLabel: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  totalStore: {
    color: "rgba(255,255,255,0.74)",
    fontFamily: fonts.regular,
    fontSize: typography.small,
  },
  totalValue: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 34,
    fontWeight: "800",
  },
});
