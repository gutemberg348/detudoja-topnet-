import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";
import { AppButton } from "./AppButton";

const methodLabels = {
  BONUS: "Saldo de bonus",
  CARTAO: "Cartao",
  CASHBACK: "Cashback",
  MISTO: "Carteiras DeTudoJa",
  PIX: "Pix",
  SALDO_PIX: "Saldo Pix",
};

const originLabels = {
  AJUSTE_ADMIN: "Ajuste administrativo",
  BONUS_INDICACAO: "Indicacao direta",
  BONUS_REDE: "Bonus de rede",
  BONUS_VENDEDOR: "Bonus do vendedor",
  CASHBACK: "Cashback",
  ESTORNO: "Estorno",
  PAGAMENTO: "Pagamento",
  SAQUE: "Saque",
  VENDA: "Venda",
};

function formatDateTime(value) {
  if (!value) {
    return "Data nao informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function WalletMovementReceiptModal({ movement, onClose }) {
  if (!movement) {
    return null;
  }

  const isDebit = movement.tipo === "DEBITO";
  const payment = movement.payment;
  const recipient = payment?.recipient?.name;
  const title = payment ? "Comprovante de pagamento" : "Detalhes da movimentacao";
  const displayAmountCents = payment?.totalAmountCents ?? movement.valor_centavos;
  const reference =
    payment?.charge?.code
    ?? payment?.orderCode
    ?? `MOV-${String(movement.id).padStart(6, "0")}`;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.overlay}>
        <Pressable
          accessibilityLabel="Fechar comprovante"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={[styles.heroIcon, isDebit ? styles.heroIconDebit : styles.heroIconCredit]}>
                <Ionicons
                  color={isDebit ? "#C2410C" : colors.primaryDark}
                  name={isDebit ? "arrow-up" : "checkmark"}
                  size={25}
                />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>
                  {isDebit ? "SAIDA CONFIRMADA" : "ENTRADA CONFIRMADA"}
                </Text>
                <Text style={styles.title}>{title}</Text>
              </View>
              <Pressable
                accessibilityLabel="Fechar"
                hitSlop={10}
                onPress={onClose}
                style={styles.closeButton}
              >
                <Ionicons color={colors.textPrimary} name="close" size={21} />
              </Pressable>
            </View>

            <View style={styles.amountBlock}>
              <Text style={styles.amountLabel}>{isDebit ? "Valor pago" : "Valor recebido"}</Text>
              <Text style={[styles.amount, isDebit ? styles.amountDebit : styles.amountCredit]}>
                {isDebit ? "-" : "+"}{formatarDinheiro(Math.abs(displayAmountCents))}
              </Text>
              <View style={styles.processedBadge}>
                <Ionicons color={colors.primaryDark} name="checkmark-circle" size={15} />
                <Text style={styles.processedText}>{movement.status}</Text>
              </View>
            </View>

            {recipient ? (
              <View style={styles.recipientCard}>
                <View style={styles.recipientIcon}>
                  <Ionicons
                    color={colors.primaryDark}
                    name={payment.recipient.type === "STORE" ? "storefront-outline" : "person-outline"}
                    size={21}
                  />
                </View>
                <View style={styles.recipientCopy}>
                  <Text style={styles.recipientLabel}>Pago para</Text>
                  <Text style={styles.recipientName}>{recipient}</Text>
                  {payment.charge?.title ? (
                    <Text style={styles.recipientMeta}>{payment.charge.title}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.detailsCard}>
              <DetailRow label="Data e hora" value={formatDateTime(payment?.paidAt ?? movement.data)} />
              <DetailRow label="Identificador" value={reference} />
              <DetailRow label="Forma de pagamento" value={methodLabels[payment?.method] ?? payment?.method} />
              <DetailRow label="Carteira utilizada" value={movement.walletName} />
              {payment && payment.totalAmountCents !== movement.valor_centavos ? (
                <DetailRow label="Debitado desta carteira" value={formatarDinheiro(movement.valor_centavos)} />
              ) : null}
              <DetailRow label="Origem" value={originLabels[movement.origem] ?? movement.origem} />
              <DetailRow label="Saldo antes" value={formatarDinheiro(movement.balanceBeforeCents)} />
              <DetailRow label="Saldo depois" value={formatarDinheiro(movement.balanceAfterCents)} />
            </View>

            <View style={styles.descriptionCard}>
              <Ionicons color={colors.primaryDark} name="receipt-outline" size={19} />
              <Text style={styles.description}>{movement.descricao}</Text>
            </View>

            <Text style={styles.securityText}>
              Este registro foi processado pela DeTudoJa e permanece salvo no seu extrato.
            </Text>
            <AppButton icon="checkmark" onPress={onClose} title="Concluir" />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
    fontWeight: "800",
  },
  amountBlock: {
    alignItems: "center",
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  amountCredit: { color: colors.primaryDark },
  amountDebit: { color: colors.textPrimary },
  amountLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  description: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 19,
  },
  descriptionCard: {
    alignItems: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
  },
  detailRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  detailValue: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: typography.small,
    fontWeight: "600",
    textAlign: "right",
  },
  eyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radius.round,
    height: 4,
    marginTop: spacing.sm,
    width: 42,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heroIcon: {
    alignItems: "center",
    borderRadius: radius.round,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroIconCredit: { backgroundColor: colors.primarySoft },
  heroIconDebit: { backgroundColor: "#FFF4ED" },
  overlay: {
    backgroundColor: "rgba(10, 23, 16, 0.38)",
    flex: 1,
    justifyContent: "flex-end",
  },
  processedBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  processedText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  recipientCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  recipientCopy: { flex: 1, gap: 2, minWidth: 0 },
  recipientIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  recipientLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  recipientMeta: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  recipientName: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  securityText: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
    paddingHorizontal: spacing.md,
    textAlign: "center",
  },
  sheet: {
    alignSelf: "center",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "92%",
    maxWidth: 560,
    overflow: "hidden",
    width: "100%",
    ...shadow,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h2,
    fontWeight: "800",
  },
});
