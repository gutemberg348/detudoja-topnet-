import Ionicons from "@expo/vector-icons/Ionicons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function GatewayPixPaymentScreen({ navigation, route }) {
  const gatewayPayment = route.params?.gatewayPayment;
  const order = route.params?.order;
  const store = route.params?.store;
  const checkoutGroups = Array.isArray(route.params?.checkoutGroups)
    ? route.params.checkoutGroups
    : [];
  const checkoutIndex = Math.max(0, Number(route.params?.checkoutIndex ?? 0));
  const hasNextStore = checkoutIndex + 1 < checkoutGroups.length;

  function continueFlow() {
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

    navigation.replace("CustomerOrderDetails", { order });
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.primaryDark} name="qr-code-outline" size={28} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>PAGAMENTO PIX</Text>
          <Text style={styles.title}>Escaneie para pagar</Text>
          <Text style={styles.subtitle}>
            {store?.name ?? "Sua compra"} sera enviada quando o Asaas confirmar o pagamento.
          </Text>
        </View>
      </View>

      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Valor do Pix</Text>
        <Text style={styles.amount}>{formatarDinheiro(order?.payment?.pixCents ?? order?.totalCents ?? 0)}</Text>
        <Text style={styles.orderCode}>{order?.code ?? "Pedido Brasil Cashback"}</Text>
      </View>

      <View style={styles.qrCard}>
        {gatewayPayment?.qrImageDataUrl ? (
          <Image source={{ uri: gatewayPayment.qrImageDataUrl }} style={styles.qrImage} />
        ) : (
          <View style={styles.qrUnavailable}>
            <Ionicons color={colors.warning} name="warning-outline" size={26} />
            <Text style={styles.qrUnavailableText}>Nao foi possivel carregar o QR agora.</Text>
          </View>
        )}
        <Text style={styles.qrTitle}>Abra o app do seu banco e leia o QR</Text>
        <Text style={styles.qrCopy}>O pagamento e confirmado automaticamente.</Text>
      </View>

      {gatewayPayment?.pixCopyPaste ? (
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
          {hasNextStore
            ? "Este Pix pertence somente a esta loja. Voce pode seguir para a proxima sem perder este pedido."
            : "Confira o valor antes de pagar. A confirmacao chega em tempo real no pedido."}
        </Text>
      </View>

      <AppButton
        icon={hasNextStore ? "arrow-forward" : "receipt-outline"}
        onPress={continueFlow}
        title={hasNextStore ? "Continuar para a proxima loja" : "Acompanhar pedido"}
      />
      <Pressable
        onPress={() => hasNextStore
          ? navigation.navigate("CustomerOrderDetails", { order })
          : navigation.navigate("Main")}
        style={styles.laterButton}
      >
        <Text style={styles.laterText}>
          {hasNextStore ? "Acompanhar este pedido" : "Pagar depois"}
        </Text>
      </Pressable>
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
