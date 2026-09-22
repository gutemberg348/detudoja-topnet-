import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { PaymentFeedbackOverlay } from "../components/PaymentFeedbackOverlay";
import { ScreenContainer } from "../components/ScreenContainer";
import { useRealtimeCharge } from "../hooks/useRealtimeCharge";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { getCharge } from "../services/charges.api";
import { getCustomerOrders } from "../services/orders.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function GatewayPixPaymentScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const gatewayPayment = route.params?.gatewayPayment;
  const [charge, setCharge] = useState(route.params?.charge ?? null);
  const paymentBreakdown = route.params?.paymentBreakdown;
  const [order, setOrder] = useState(route.params?.order ?? null);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const successHandledRef = useRef(false);
  const store = route.params?.store;
  const checkoutGroups = Array.isArray(route.params?.checkoutGroups)
    ? route.params.checkoutGroups
    : [];
  const checkoutIndex = Math.max(0, Number(route.params?.checkoutIndex ?? 0));
  const hasNextStore = checkoutIndex + 1 < checkoutGroups.length;
  const conversationId = route.params?.conversationId ?? null;
  const paymentConfirmed = charge
    ? charge.status === "PAGA"
    : ["PAGO", "LIQUIDADO"].includes(order?.payment?.status);
  const handleChargeUpdated = useCallback((updatedCharge) => setCharge(updatedCharge), []);
  const handleOrderUpdated = useCallback((payload = {}) => {
    if (payload.order) setOrder(payload.order);
  }, []);

  useRealtimeCharge({
    accessToken: session?.accessToken,
    chargeId: charge?.id,
    onChargeUpdated: handleChargeUpdated,
  });

  useRealtimeOrders({
    accessToken: session?.accessToken,
    active: Boolean(order?.id),
    onOrderEvent: handleOrderUpdated,
    orderId: order?.id,
    storeId: order?.storeId ?? store?.id,
  });

  const syncPaymentStatus = useCallback(async () => {
    if (!session?.accessToken || paymentConfirmed) return;
    try {
      if (charge?.code) {
        const response = await getCharge(session.accessToken, charge.code);
        if (response.charge) setCharge(response.charge);
        return;
      }
      if (order?.id) {
        const response = await getCustomerOrders(session.accessToken, {
          storeId: order.storeId ?? store?.id,
        });
        const updatedOrder = (response.orders ?? []).find(
          (item) => Number(item.id) === Number(order.id),
        );
        if (updatedOrder) setOrder(updatedOrder);
      }
    } catch {
      // The socket remains active; the next lightweight check retries.
    }
  }, [charge?.code, order?.id, order?.storeId, paymentConfirmed, session?.accessToken, store?.id]);

  useFocusEffect(useCallback(() => {
    syncPaymentStatus();
    if (paymentConfirmed) return undefined;
    const interval = setInterval(syncPaymentStatus, 5000);
    return () => clearInterval(interval);
  }, [paymentConfirmed, syncPaymentStatus]));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncPaymentStatus();
    });
    return () => subscription.remove();
  }, [syncPaymentStatus]);

  useEffect(() => {
    if (!paymentConfirmed || successHandledRef.current) return;
    successHandledRef.current = true;
    setPaymentFeedback({
      message: charge
        ? `${store?.name ?? "O recebedor"} recebeu a confirmação do seu pagamento.`
        : `${store?.name ?? "A loja"} recebeu a confirmação. Seu pedido já está em acompanhamento.`,
      status: "success",
      title: "Pix confirmado",
    });
  }, [charge, paymentConfirmed, store?.name]);

  function continueFlow() {
    if (charge) {
      navigation.popToTop();
      return;
    }
    if (hasNextStore) {
      navigation.reset({
        index: 2,
        routes: [
          { name: "Main" },
          { name: "Cart" },
          {
            name: "Checkout",
            params: {
              ...checkoutGroups[checkoutIndex + 1],
              checkoutGroups,
              checkoutIndex: checkoutIndex + 1,
            },
          },
        ],
      });
      return;
    }

    navigation.replace("CustomerOrderDetails", { conversationId, order });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.primaryDark} name="qr-code-outline" size={28} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{paymentConfirmed ? "PAGAMENTO CONFIRMADO" : "PAGAMENTO PIX"}</Text>
          <Text style={styles.title}>{paymentConfirmed ? "Pagamento concluído" : "Escaneie para pagar"}</Text>
          <Text style={styles.subtitle}>
            {charge
              ? `${store?.name ?? "A loja"} recebe somente depois da confirmacao do Pix.`
              : `${store?.name ?? "Sua compra"} sera enviada quando o Asaas confirmar o pagamento.`}
          </Text>
        </View>
      </View>

      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Valor do Pix</Text>
        <Text style={styles.amount}>{formatarDinheiro(paymentBreakdown?.pixCents ?? order?.payment?.pixCents ?? order?.totalCents ?? charge?.amountCents ?? 0)}</Text>
        <Text style={styles.orderCode}>{charge?.code ?? order?.code ?? "Pagamento Brasil Cashback"}</Text>
        {charge && Number(paymentBreakdown?.walletCents ?? 0) > 0 ? (
          <Text style={styles.orderCode}>{formatarDinheiro(paymentBreakdown.walletCents)} reservado do seu saldo</Text>
        ) : null}
      </View>

      <View style={styles.qrCard}>
        {paymentConfirmed ? (
          <View style={styles.paidIcon}><Ionicons color={colors.card} name="checkmark" size={42} /></View>
        ) : null}
        {!paymentConfirmed && gatewayPayment?.qrImageDataUrl ? (
          <Image source={{ uri: gatewayPayment.qrImageDataUrl }} style={styles.qrImage} />
        ) : !paymentConfirmed ? (
          <View style={styles.qrUnavailable}>
            <Ionicons color={colors.warning} name="warning-outline" size={26} />
            <Text style={styles.qrUnavailableText}>Nao foi possivel carregar o QR agora.</Text>
          </View>
        ) : null}
        <Text style={styles.qrTitle}>{paymentConfirmed ? "Recebido pela loja" : "Abra o app do seu banco e leia o QR"}</Text>
        <Text style={styles.qrCopy}>{paymentConfirmed ? "A confirmação chegou em tempo real." : "O pagamento é confirmado automaticamente."}</Text>
      </View>

      {!paymentConfirmed && gatewayPayment?.pixCopyPaste ? (
        <View style={styles.copyCard}>
          <View style={styles.copyHeader}>
            <Ionicons color={colors.primaryDark} name="copy-outline" size={18} />
            <Text style={styles.copyTitle}>Pix copia e cola</Text>
          </View>
          <Text selectable style={styles.copyValue}>{gatewayPayment.pixCopyPaste}</Text>
        </View>
      ) : null}

      <View style={styles.notice}>
        <Ionicons
          color={colors.primaryDark}
          name={hasNextStore ? "layers-outline" : "shield-checkmark-outline"}
          size={20}
        />
        <Text style={styles.noticeText}>
          {charge
            ? "O saldo usado fica reservado. Se este Pix expirar ou falhar, ele volta automaticamente para sua carteira."
            : hasNextStore
            ? "Este Pix pertence somente a esta loja. Voce pode seguir para a proxima sem perder este pedido."
            : "Confira o valor antes de pagar. A confirmacao chega em tempo real no pedido."}
        </Text>
      </View>

      <AppButton
        icon={charge ? "home-outline" : hasNextStore ? "arrow-forward" : "receipt-outline"}
        onPress={continueFlow}
        title={charge ? paymentConfirmed ? "Concluir" : "Voltar ao início" : hasNextStore ? "Continuar para a próxima loja" : "Acompanhar pedido"}
      />
      {!charge ? (
        <Pressable
          onPress={() => hasNextStore
            ? navigation.navigate("CustomerOrderDetails", { conversationId, order })
            : navigation.navigate("Main")}
          style={styles.laterButton}
        >
          <Text style={styles.laterText}>{hasNextStore ? "Acompanhar este pedido" : "Pagar depois"}</Text>
        </Pressable>
      ) : null}
      <PaymentFeedbackOverlay
        amountCents={paymentBreakdown?.pixCents ?? order?.payment?.pixCents ?? order?.totalCents ?? charge?.amountCents}
        counterparty={store?.name}
        durationMs={2400}
        message={paymentFeedback?.message}
        onFinished={continueFlow}
        status={paymentFeedback?.status}
        title={paymentFeedback?.title}
        visible={Boolean(paymentFeedback)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  amount: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: 34,
    fontWeight: "800",
  },
  amountCard: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BDEFD6",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xl,
  },
  amountLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  copyCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  copyHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  copyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  copyValue: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 17,
  },
  eyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: "700",
  },
  hero: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: 3,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 54,
    justifyContent: "center",
    width: 54,
  },
  laterButton: {
    alignItems: "center",
    padding: spacing.sm,
  },
  laterText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  notice: {
    alignItems: "flex-start",
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 19,
  },
  orderCode: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  paidIcon: {
    alignItems: "center",
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 82,
    justifyContent: "center",
    width: 82,
  },
  qrCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
    ...shadow,
  },
  qrCopy: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: "center",
  },
  qrImage: {
    height: 240,
    resizeMode: "contain",
    width: 240,
  },
  qrTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "center",
  },
  qrUnavailable: {
    alignItems: "center",
    gap: spacing.sm,
    height: 180,
    justifyContent: "center",
  },
  qrUnavailableText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
});
