import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { useFeedback } from "../components/FeedbackProvider";
import { LocalRewardNotice } from "../components/LocalRewardNotice";
import { PaymentFeedbackOverlay } from "../components/PaymentFeedbackOverlay";
import { ScreenContainer } from "../components/ScreenContainer";
import { useRealtimeCharge } from "../hooks/useRealtimeCharge";
import { getStoreSignupQr } from "../services/seller.api";
import { cancelServiceConversation, completeServiceOutsideApp } from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarHora } from "../utils/date";
import { formatarDinheiro } from "../utils/money";
import { serviceQrActions } from "../utils/service-closure";
import { colors, fonts, radius, shadow, spacing, typography } from "../utils/theme";

export function ChargeQrScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const { notify } = useFeedback();
  const [closingAction, setClosingAction] = useState("");
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingError, setClosingError] = useState("");
  const [copied, setCopied] = useState(false);
  const [charge, setCharge] = useState(route.params?.charge ?? null);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const qrImageDataUrl = route.params?.qrImageDataUrl;
  const [signupCopied, setSignupCopied] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupQr, setSignupQr] = useState(null);

  const handleChargeUpdated = useCallback((updatedCharge) => {
    setCharge((current) => ({
      ...updatedCharge,
      localRewardPolicy: updatedCharge.localRewardPolicy ?? current?.localRewardPolicy,
    }));
    if (updatedCharge?.status === "PAGA") {
      setSignupQr(null);
      setPaymentReceived(true);
    }
  }, []);

  useRealtimeCharge({
    accessToken: session?.accessToken,
    chargeId: charge?.id,
    onChargeUpdated: handleChargeUpdated,
  });

  if (!charge || !qrImageDataUrl) {
    return (
      <View style={styles.empty}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
        <Text style={styles.emptyText}>A cobranca nao esta disponivel para exibir.</Text>
      </View>
    );
  }

  async function copyCode() {
    await Clipboard.setStringAsync(charge.qrPayload ?? charge.code);
    setCopied(true);
  }

  async function openStoreSignupQr() {
    const storeId = charge?.merchant?.type === "STORE" ? charge.merchant.id : null;

    if (!storeId || !session?.accessToken) {
      return;
    }

    setSignupError("");
    setSignupLoading(true);

    try {
      setSignupQr(await getStoreSignupQr(session.accessToken, storeId));
    } catch (requestError) {
      setSignupError(requestError.message ?? "Nao foi possivel gerar o QR de cadastro.");
    } finally {
      setSignupLoading(false);
    }
  }

  async function copySignupLink() {
    if (!signupQr?.registrationUrl) {
      return;
    }

    await Clipboard.setStringAsync(signupQr.registrationUrl);
    setSignupCopied(true);
  }

  async function shareSignup() {
    if (!signupQr) return;

    try {
      await Share.share({
        message: signupQr.shareMessage,
        title: `Convite da ${signupQr.store?.name ?? charge.merchant?.name}`,
        url: signupQr.registrationUrl,
      });
    } catch {
      await copySignupLink();
    }
  }

  const isStoreCharge = charge.merchant?.type === "STORE";
  const serviceActions = serviceQrActions(charge);
  const qrAvailable = !["CANCELADA", "EXPIRADA"].includes(charge.status);

  async function closeService() {
    if (closingLoading || !session?.accessToken) return;
    if ((closingAction === "external" && !serviceActions.canCompleteOutsideApp)
      || (closingAction === "cancel" && !serviceActions.canCancel)) {
      setClosingError("O atendimento mudou. Volte para a conversa e confira o status atualizado.");
      setClosingAction("");
      return;
    }
    setClosingLoading(true);
    setClosingError("");
    try {
      if (closingAction === "external") {
        const response = await completeServiceOutsideApp(session.accessToken, charge.serviceConversationId, charge.serviceProposalId);
        setCharge(response.charge);
        notify("Servico concluido", "Recebimento fora do app registrado, sem pool, cashback ou ganhos da rede.");
      } else {
        await cancelServiceConversation(session.accessToken, charge.serviceConversationId);
        setCharge((current) => ({ ...current, status: "CANCELADA", serviceConversationStatus: "CANCELADA" }));
        notify("Atendimento cancelado", "A cobranca foi cancelada e nao pode mais ser paga.");
      }
      setClosingAction("");
      navigation.goBack();
    } catch (error) {
      setClosingError(error.message ?? "Nao foi possivel encerrar o atendimento. Tente novamente.");
    } finally { setClosingLoading(false); }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons color={colors.primaryDark} name="qr-code-outline" size={25} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>{serviceActions.completedOutsideApp ? "Atendimento concluido" : qrAvailable ? "Cobranca pronta" : "Cobranca encerrada"}</Text>
          <Text style={styles.title}>{serviceActions.completedOutsideApp ? "Recebido fora do app" : qrAvailable ? "Peça para o cliente ler o QR." : "Este QR nao esta mais disponivel"}</Text>
        </View>
      </View>

      <View style={[styles.amountCard, charge.status === "PAGA" && styles.amountCardPaid]}>
        <Text style={styles.amountLabel}>{charge.title}</Text>
        <Text style={styles.amount}>{formatarDinheiro(charge.amountCents)}</Text>
        <Text style={styles.expiry}>{serviceActions.completedOutsideApp ? "Conclusao registrada pelo prestador, sem pagamento pelo app" : charge.status === "PAGA" ? "Pagamento confirmado em tempo real" : !qrAvailable ? "A cobranca nao pode mais ser paga" : charge.expiresAt ? `Valida ate ${formatExpiry(charge.expiresAt)}` : "Sem prazo para expirar"}</Text>
      </View>

      {charge.status === "PAGA" ? <LocalRewardNotice policy={charge.localRewardPolicy} /> : charge.serviceConversationId ? (
        <View style={styles.notice}>
          <Ionicons color={colors.primaryDark} name="information-circle-outline" size={20} />
          <Text style={styles.noticeText}>Pool, cashback e ganhos da rede so sao gerados pelo fluxo de pagamento confirmado no app. Recebimento fora do app nao gera esses ganhos.</Text>
        </View>
      ) : <LocalRewardNotice policy={charge.localRewardPolicy} />}

      {qrAvailable ? <View style={styles.qrCard}>
        <View style={styles.qrFrame}>
          <Image accessibilityLabel="QR da cobranca" source={{ uri: qrImageDataUrl }} style={styles.qrImage} />
        </View>
        <Text style={styles.qrTitle}>{charge.status === "PAGA" ? "Pagamento recebido" : "Ler cobranca Brasil Cashback"}</Text>
        <Text style={styles.qrText}>
          {charge.status === "PAGA" ? "A venda foi confirmada e os saldos foram atualizados." : "O cliente abre Pagar QR no app, confere o valor e confirma com a carteira."}
        </Text>
        <Pressable onPress={copyCode} style={({ pressed }) => [styles.code, pressed && styles.pressed]}>
          <View style={styles.codeCopy}>
            <Text style={styles.codeLabel}>Codigo da cobranca</Text>
            <Text numberOfLines={1} style={styles.codeValue}>{charge.code}</Text>
          </View>
          <Ionicons color={colors.primaryDark} name={copied ? "checkmark" : "copy-outline"} size={20} />
        </Pressable>
      </View> : null}

      <View style={styles.notice}>
        <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={20} />
        <Text style={styles.noticeText}>O QR so identifica a cobranca. O valor e o recebedor sao sempre conferidos no servidor.</Text>
      </View>

      {serviceActions.canCompleteOutsideApp || serviceActions.canCancel ? (
        <View style={styles.serviceActions}>
          <Text style={styles.qrTitle}>Encerrar atendimento</Text>
          <Text style={styles.noticeText}>Se recebeu em dinheiro ou por outro meio fora do app, registre aqui para encerrar a conversa.</Text>
          {serviceActions.canCompleteOutsideApp ? <AppButton icon="cash-outline" onPress={() => { setClosingError(""); setClosingAction("external"); }} title="Recebi fora do app" /> : null}
          {serviceActions.canCancel ? <AppButton icon="close-circle-outline" onPress={() => { setClosingError(""); setClosingAction("cancel"); }} title="Cancelar atendimento" variant="outline" /> : null}
        </View>
      ) : null}
      {closingError && !closingAction ? <Text accessibilityLiveRegion="polite" style={styles.signupError}>{closingError}</Text> : null}

      {isStoreCharge ? (
        <Pressable
          disabled={signupLoading}
          onPress={openStoreSignupQr}
          style={({ pressed }) => [styles.signupPrompt, pressed && styles.pressed, signupLoading && styles.disabled]}
        >
          <View style={styles.signupPromptIcon}>
            {signupLoading ? (
              <ActivityIndicator color={colors.primaryDark} size="small" />
            ) : (
              <Ionicons color={colors.primaryDark} name="person-add-outline" size={21} />
            )}
          </View>
          <View style={styles.signupPromptCopy}>
            <Text style={styles.signupPromptTitle}>Cliente nao tem cadastro?</Text>
            <Text style={styles.signupPromptText}>
              Mostre um QR para ele criar a conta pela loja e receber cashback.
            </Text>
          </View>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={19} />
        </Pressable>
      ) : null}

      {signupError ? <Text style={styles.signupError}>{signupError}</Text> : null}

      <AppButton icon="arrow-back-outline" onPress={() => navigation.goBack()} title={charge.serviceConversationId ? "Voltar para conversa" : "Voltar"} variant="outline" />

      <Modal animationType="fade" onRequestClose={() => { if (!closingLoading) setClosingAction(""); }} transparent visible={Boolean(closingAction)}>
        <View style={styles.signupBackdrop}>
          <View style={styles.signupModal}>
            <Text style={styles.signupModalTitle}>{closingAction === "external" ? "Voce ja recebeu fora do app?" : "Cancelar este atendimento?"}</Text>
            <Text style={styles.signupModalText}>{closingAction === "external"
              ? "Confirme apenas se o servico foi realizado e voce ja recebeu. A conversa sera concluida e o QR sera cancelado. Nao havera movimentacao de carteiras, pool, cashback ou ganhos da rede."
              : "A conversa e a cobranca ainda nao paga serao canceladas. Este QR nao podera mais ser usado."}</Text>
            {closingError ? <Text accessibilityLiveRegion="polite" style={styles.signupError}>{closingError}</Text> : null}
            <AppButton loading={closingLoading} onPress={closeService} title={closingAction === "external" ? "Confirmar recebimento e finalizar" : "Confirmar cancelamento"} variant={closingAction === "external" ? "primary" : "danger"} />
            <AppButton disabled={closingLoading} onPress={() => setClosingAction("")} title="Continuar atendimento" variant="outline" />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSignupQr(null)}
        transparent
        visible={Boolean(signupQr)}
      >
        <View style={styles.signupBackdrop}>
          <View style={styles.signupModal}>
            <View style={styles.signupModalHeader}>
              <View>
                <Text style={styles.kicker}>Cadastro pela loja</Text>
                <Text style={styles.signupModalTitle}>Novo cliente</Text>
              </View>
              <Pressable onPress={() => setSignupQr(null)} style={styles.signupClose}>
                <Ionicons color={colors.textPrimary} name="close" size={20} />
              </Pressable>
            </View>
            <Text style={styles.signupModalText}>
              O cliente aponta a camera para este QR, cria a conta online e depois entra no app para comprar e receber cashback em {signupQr?.store?.name ?? charge.merchant?.name}.
            </Text>
            <View style={styles.signupQrFrame}>
              {signupQr?.qrImageDataUrl ? (
                <Image
                  accessibilityLabel="QR de cadastro pela loja"
                  source={{ uri: signupQr.qrImageDataUrl }}
                  style={styles.signupQrImage}
                />
              ) : null}
            </View>
            <View style={styles.signupCode}>
              <Text style={styles.codeLabel}>Codigo da loja</Text>
              <Text selectable style={styles.signupCodeValue}>{signupQr?.registrationCode}</Text>
            </View>
            <AppButton icon="share-social-outline" onPress={shareSignup} title="Compartilhar cadastro" />
            <Pressable onPress={copySignupLink} style={({ pressed }) => [styles.signupLink, pressed && styles.pressed]}>
              <View style={styles.codeCopy}>
                <Text style={styles.codeLabel}>Link de cadastro</Text>
                <Text numberOfLines={1} style={styles.codeValue}>{signupQr?.registrationUrl}</Text>
              </View>
              <Ionicons color={colors.primaryDark} name={signupCopied ? "checkmark" : "copy-outline"} size={20} />
            </Pressable>
          </View>
        </View>
      </Modal>
      <PaymentFeedbackOverlay
        amountCents={charge.amountCents}
        counterparty={charge.customer?.name ?? "Cliente Brasil Cashback"}
        durationMs={3000}
        message="A venda foi confirmada e o valor ja entrou no seu historico."
        onFinished={() => {
          setPaymentReceived(false);
          navigation.goBack();
        }}
        status="success"
        title="Pagamento recebido"
        visible={paymentReceived}
      />
    </ScreenContainer>
  );
}

function formatExpiry(value) {
  return formatarHora(value);
}

const styles = StyleSheet.create({
  serviceActions: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, gap: spacing.md, padding: spacing.lg },
  amount: { color: colors.card, fontFamily: fonts.bold, fontSize: 34, fontWeight: "800" },
  amountCard: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, gap: spacing.xs, padding: spacing.xl, ...shadow },
  amountCardPaid: { backgroundColor: colors.success },
  amountLabel: { color: "#D1FAE5", fontFamily: fonts.medium, fontSize: typography.body },
  code: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  codeCopy: { flex: 1, gap: 3, minWidth: 0 },
  codeLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: typography.caption },
  codeValue: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  content: { gap: spacing.xl, paddingBottom: spacing.xxxl },
  disabled: { opacity: 0.65 },
  empty: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  emptyText: { color: colors.textSecondary, fontFamily: fonts.medium, textAlign: "center" },
  expiry: { color: "#D1FAE5", fontFamily: fonts.medium, fontSize: typography.caption },
  heading: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  headingCopy: { flex: 1, gap: 2 },
  headingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.lg, height: 48, justifyContent: "center", width: 48 },
  kicker: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption, textTransform: "uppercase" },
  notice: { alignItems: "flex-start", backgroundColor: "#F0FDF4", borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  noticeText: { color: colors.textSecondary, flex: 1, fontFamily: fonts.medium, fontSize: typography.small, lineHeight: 19 },
  pressed: { opacity: 0.76 },
  qrCard: { alignItems: "center", backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.xl, ...shadow },
  qrFrame: { backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  qrImage: { height: 238, width: 238 },
  qrText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 20, textAlign: "center" },
  qrTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h3, fontWeight: "700" },
  signupBackdrop: { alignItems: "center", backgroundColor: "rgba(20, 32, 25, 0.46)", flex: 1, justifyContent: "center", padding: spacing.lg },
  signupClose: { alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  signupCode: { alignItems: "center", backgroundColor: "#F8FBF9", borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: 3, padding: spacing.sm },
  signupCodeValue: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  signupError: { color: colors.danger, fontFamily: fonts.medium, fontSize: typography.small, textAlign: "center" },
  signupLink: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  signupModal: { backgroundColor: colors.card, borderRadius: 12, gap: spacing.md, maxWidth: 460, padding: spacing.lg, width: "100%", ...shadow },
  signupModalHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  signupModalText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.small, lineHeight: 19 },
  signupModalTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
  signupPrompt: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  signupPromptCopy: { flex: 1, gap: 2, minWidth: 0 },
  signupPromptIcon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  signupPromptText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  signupPromptTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
  signupQrFrame: { alignSelf: "center", backgroundColor: colors.card, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm },
  signupQrImage: { height: 220, width: 220 },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.h2, fontWeight: "800" },
});
