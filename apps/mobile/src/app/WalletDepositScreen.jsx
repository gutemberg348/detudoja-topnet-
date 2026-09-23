import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { PaymentFeedbackOverlay } from "../components/PaymentFeedbackOverlay";
import { ScreenContainer } from "../components/ScreenContainer";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { createWalletDeposit, getWalletDeposit, refreshWalletDeposit } from "../services/wallet.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

const quickAmounts = [1000, 2500, 5000];
const depositFeeCents = 99;

function moneyToCents(value) {
  const raw = String(value ?? "").replace(/[^\d,]/g, "");
  if (!raw) return 0;
  const [whole, fraction = ""] = raw.split(",");
  return Number(whole || 0) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function centsToInput(value) {
  return (Number(value) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function newIdempotencyKey() {
  return `wallet-deposit-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function WalletDepositScreen({ navigation }) {
  const { session } = useAuthStore();
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const [amountInput, setAmountInput] = useState("10,00");
  const [copied, setCopied] = useState(false);
  const [deposit, setDeposit] = useState(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [paid, setPaid] = useState(false);
  const amountCents = moneyToCents(amountInput);
  const netAmountCents = Math.max(amountCents - depositFeeCents, 0);

  const loadDeposit = useCallback(async () => {
    if (!deposit?.id || !session?.accessToken) return;
    try {
      const response = await getWalletDeposit(session.accessToken, deposit.id);
      setDeposit(response.deposit);
      if (response.deposit.status === "CONFIRMADO") setPaid(true);
    } catch {
      // O saldo continua sendo atualizado na carteira mesmo se esta tela for fechada.
    }
  }, [deposit?.id, session?.accessToken]);

  useEffect(() => {
    const socket = getRealtimeSocket(session?.accessToken);
    if (!socket) return undefined;
    socket.on(realtimeEvents.walletUpdated, loadDeposit);
    return () => socket.off(realtimeEvents.walletUpdated, loadDeposit);
  }, [loadDeposit, session?.accessToken]);

  async function createDeposit() {
    if (amountCents < 100) {
      setError("Informe pelo menos R$ 1,00 para gerar o Pix.");
      return;
    }
    setError("");
    setIsCreating(true);
    try {
      const response = await createWalletDeposit(session.accessToken, {
        amountCents,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setDeposit(response.deposit);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel gerar o Pix agora.");
      idempotencyKeyRef.current = newIdempotencyKey();
    } finally {
      setIsCreating(false);
    }
  }

  async function refreshStatus() {
    if (!deposit?.id) return;
    setError("");
    setIsRefreshing(true);
    try {
      const response = await refreshWalletDeposit(session.accessToken, deposit.id);
      setDeposit(response.deposit);
      if (response.deposit.status === "CONFIRMADO") setPaid(true);
      else if (response.deposit.status !== "PENDENTE") setError("Este Pix nao esta mais aguardando pagamento. Gere uma nova recarga para continuar.");
      else setError("O Pix ainda nao foi identificado. Aguarde alguns segundos e tente novamente.");
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel consultar este Pix agora.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function copyPix() {
    if (!deposit?.payment?.pixCopyPaste) return;
    await Clipboard.setStringAsync(deposit.payment.pixCopyPaste);
    setCopied(true);
  }

  if (deposit) {
    return (
      <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
        <View style={styles.heading}>
          <View style={styles.headingIcon}><Ionicons color={colors.primaryDark} name="qr-code-outline" size={25} /></View>
          <View style={styles.headingCopy}>
            <Text style={styles.kicker}>Recarga da carteira</Text>
            <Text style={styles.title}>Pague o Pix para adicionar saldo</Text>
          </View>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Saldo que sera adicionado</Text>
          <Text style={styles.amount}>{formatarDinheiro(deposit.netAmountCents)}</Text>
          <View style={styles.amountBreakdown}>
            <Text style={styles.amountText}>Pix pago: {formatarDinheiro(deposit.grossAmountCents)}</Text>
            <Text style={styles.amountText}>Taxa Pix: - {formatarDinheiro(deposit.feeCents)}</Text>
          </View>
        </View>

        <View style={styles.qrCard}>
          {deposit.payment?.qrImageDataUrl ? (
            <Image accessibilityLabel="QR Pix para recarregar carteira" source={{ uri: deposit.payment.qrImageDataUrl }} style={styles.qrImage} />
          ) : (
            <View style={styles.qrUnavailable}><Ionicons color={colors.warning} name="warning-outline" size={28} /><Text style={styles.qrUnavailableText}>O QR nao esta disponivel.</Text></View>
          )}
          <Text style={styles.qrTitle}>Abra seu banco e pague este Pix</Text>
          <Text style={styles.qrCopy}>Quando for confirmado, o Saldo Pix fica disponivel automaticamente.</Text>
        </View>

        {deposit.payment?.pixCopyPaste ? (
          <Pressable onPress={copyPix} style={({ pressed }) => [styles.copyCard, pressed && styles.pressed]}>
            <View style={styles.copyText}><Text style={styles.copyLabel}>Pix copia e cola</Text><Text numberOfLines={1} style={styles.copyValue}>{deposit.payment.pixCopyPaste}</Text></View>
            <Ionicons color={colors.primaryDark} name={copied ? "checkmark" : "copy-outline"} size={21} />
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton icon="refresh-outline" loading={isRefreshing} onPress={refreshStatus} title="Ja paguei, atualizar saldo" />
        <Pressable onPress={() => navigation.goBack()} style={styles.later}><Text style={styles.laterText}>Pagar depois</Text></Pressable>

        <PaymentFeedbackOverlay amountCents={deposit.netAmountCents} counterparty="Sua carteira Saldo Pix" message="O Pix foi confirmado, a taxa foi descontada e o saldo liquido ja esta disponivel." onFinished={() => navigation.goBack()} status="success" title="Saldo adicionado" visible={paid} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]} keyboardVerticalOffset={8}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}><Ionicons color={colors.primaryDark} name="add-circle-outline" size={26} /></View>
        <View style={styles.headingCopy}><Text style={styles.kicker}>Saldo Pix</Text><Text style={styles.title}>Adicionar saldo</Text><Text style={styles.subtitle}>Gere um Pix e use o saldo nas compras pelo app.</Text></View>
      </View>
      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Quanto voce quer adicionar?</Text>
        <View style={styles.inputShell}><Text style={styles.currency}>R$</Text><TextInput keyboardType="decimal-pad" onChangeText={setAmountInput} placeholder="0,00" placeholderTextColor={colors.textMuted} style={styles.input} value={amountInput} /></View>
        <View style={styles.quickRow}>{quickAmounts.map((value) => <Pressable key={value} onPress={() => setAmountInput(centsToInput(value))} style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}><Text style={styles.quickText}>{formatarDinheiro(value)}</Text></Pressable>)}</View>
        <View style={styles.depositSummary}>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Valor do Pix</Text><Text style={styles.summaryValue}>{formatarDinheiro(amountCents)}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Taxa Pix</Text><Text style={styles.summaryValue}>- {formatarDinheiro(depositFeeCents)}</Text></View>
          <View style={[styles.summaryRow, styles.summaryTotal]}><Text style={styles.summaryTotalLabel}>Saldo recebido</Text><Text style={styles.summaryTotalValue}>{formatarDinheiro(netAmountCents)}</Text></View>
        </View>
      </View>
      <View style={styles.notice}><Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={21} /><Text style={styles.noticeText}>O saldo e liberado automaticamente depois da confirmacao do Pix.</Text></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton icon="qr-code-outline" loading={isCreating} onPress={createDeposit} title="Gerar Pix para adicionar saldo" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  amount: { color: colors.card, fontFamily: fonts.extraBold, fontSize: 34, fontWeight: "800" },
  amountCard: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, gap: spacing.xs, padding: spacing.xl, ...shadow },
  amountBreakdown: { borderTopColor: "rgba(255,255,255,0.22)", borderTopWidth: 1, gap: 3, marginTop: spacing.sm, paddingTop: spacing.sm },
  amountLabel: { color: "#BBF7D0", fontFamily: fonts.medium, fontSize: typography.small },
  amountText: { color: "#D1FAE5", fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  copyCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  copyLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  copyText: { flex: 1, gap: 3, minWidth: 0 },
  copyValue: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  currency: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
  depositSummary: { backgroundColor: "#F7FCF9", borderColor: colors.primaryLight, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19, textAlign: "center" },
  fieldLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.body, fontWeight: "700" },
  formCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.lg, padding: spacing.lg },
  heading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  headingCopy: { flex: 1, gap: 3, minWidth: 0 },
  headingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 52, justifyContent: "center", width: 52 },
  input: { color: colors.textPrimary, flex: 1, fontFamily: fonts.extraBold, fontSize: 28, fontWeight: "800", minHeight: 58, padding: 0 },
  inputShell: { alignItems: "center", backgroundColor: "#F7FCF9", borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  later: { alignItems: "center", padding: spacing.sm },
  laterText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  notice: { alignItems: "flex-start", backgroundColor: "#F0FDF4", borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  noticeText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19 },
  pressed: { opacity: 0.76 },
  qrCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.xl, ...shadow },
  qrCopy: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19, textAlign: "center" },
  qrImage: { height: 238, resizeMode: "contain", width: 238 },
  qrTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.body, fontWeight: "700", textAlign: "center" },
  qrUnavailable: { alignItems: "center", gap: spacing.sm, height: 180, justifyContent: "center" },
  qrUnavailableText: { color: colors.textSecondary, fontFamily: fonts.medium },
  quickButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flex: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.sm },
  quickRow: { flexDirection: "row", gap: spacing.sm },
  quickText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19 },
  summaryLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.small },
  summaryRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  summaryTotal: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.sm },
  summaryTotalLabel: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.body, fontWeight: "700" },
  summaryTotalValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.body, fontWeight: "800" },
  summaryValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  title: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h2, fontWeight: "800" },
});
