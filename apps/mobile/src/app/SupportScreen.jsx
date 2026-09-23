import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../components/AppButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { getSupportSettings } from "../services/support.api";
import { useAuthStore } from "../stores/useAuthStore";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  shadow,
  spacing,
  typography,
} from "../utils/theme";

export function SupportScreen({ route }) {
  const { session } = useAuthStore();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [support, setSupport] = useState(null);

  const loadSupport = useCallback(async () => {
    if (!session?.accessToken) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await getSupportSettings(session.accessToken);
      setSupport(response.support);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar o suporte.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.accessToken]);

  useFocusEffect(useCallback(() => {
    loadSupport();
  }, [loadSupport]));

  async function openWhatsapp() {
    if (!support?.whatsappDigits) {
      return;
    }

    const order = route?.params?.order;
    const message = order
      ? [
          "Ola, preciso solicitar o cancelamento de um pedido no Brasil Cashback.",
          `Pedido: ${order.code}`,
          `Loja: ${order.store?.name ?? "Nao informada"}`,
          `Valor: ${formatarDinheiro(order.totalCents)}`,
          `Status: ${order.status}`,
          "Motivo:",
        ].join("\n")
      : support.message;
    const url = `https://wa.me/${support.whatsappDigits}?text=${encodeURIComponent(message)}`;

    await Linking.openURL(url);
  }

  const configured = Boolean(support?.whatsappUrl);

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.card} name="chatbubbles" size={34} />
        </View>
        <Text style={styles.title}>Como podemos ajudar?</Text>
        <Text style={styles.subtitle}>
          Fale com o suporte do Brasil Cashback pelo WhatsApp cadastrado no painel admin.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primaryDark} size="large" />
          <Text style={styles.stateText}>Carregando canal de suporte...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={30} />
          <Text style={styles.errorText}>{error}</Text>
          <AppButton onPress={loadSupport} title="Tentar novamente" />
        </View>
      ) : (
        <>
          <View style={styles.supportCard}>
            <View style={styles.cardHeader}>
              <View style={styles.whatsappIcon}>
                <Ionicons color={colors.primaryDark} name="logo-whatsapp" size={25} />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Atendimento por WhatsApp</Text>
                <Text style={styles.cardText}>
                  {configured
                    ? support.whatsappDisplay
                    : "Nenhum WhatsApp de suporte foi cadastrado ainda."}
                </Text>
              </View>
            </View>

            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Mensagem inicial</Text>
              <Text style={styles.messageText}>
                {support?.message || "Ola, preciso de ajuda com minha conta no Brasil Cashback."}
              </Text>
            </View>

            <AppButton
              disabled={!configured}
              icon="logo-whatsapp"
              onPress={openWhatsapp}
              title={configured ? "Chamar suporte" : "Suporte nao configurado"}
            />
          </View>

          <View style={styles.helpGrid}>
            {route?.params?.order ? (
              <View style={styles.refundCard}>
                <View style={styles.refundHeader}>
                  <Ionicons color="#9A5B00" name="information-circle-outline" size={23} />
                  <View style={styles.tipCopy}>
                    <Text style={styles.refundTitle}>Como funciona o cancelamento</Text>
                    <Text style={styles.refundOrder}>{route.params.order.code}</Text>
                  </View>
                </View>
                <RefundRule text="Antes do pagamento, o cancelamento pode ser imediato." />
                <RefundRule text="Pago ou em atendimento: o suporte analisa antes de cancelar." />
                <RefundRule text="Saldo usado nas carteiras volta imediatamente apos a aprovacao." />
                <RefundRule text="O estorno Pix e solicitado em ate 24 horas; o banco pode concluir depois." />
                <RefundRule text="Depois da entrega, a analise inclui a reversao dos ganhos distribuidos." />
              </View>
            ) : null}
            <SupportTip
              icon="receipt-outline"
              text="Tenha o numero do pedido em maos quando falar sobre compras."
              title="Pedidos"
            />
            <SupportTip
              icon="shield-checkmark-outline"
              text="Para KYC, envie somente documentos pelos canais oficiais."
              title="Verificacao"
            />
            <SupportTip
              icon="wallet-outline"
              text="Duvidas de saldo e Pix devem informar valor e horario aproximado."
              title="Carteira"
            />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function RefundRule({ text }) {
  return (
    <View style={styles.refundRule}>
      <Ionicons color="#B66A00" name="checkmark-circle-outline" size={17} />
      <Text style={styles.refundRuleText}>{text}</Text>
    </View>
  );
}

function SupportTip({ icon, text, title }) {
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={20} />
      </View>
      <View style={styles.tipCopy}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  refundCard: {
    backgroundColor: "#FFF9F0",
    borderColor: "#F0D3A5",
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  refundHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  refundOrder: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
  },
  refundRule: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  refundRuleText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  refundTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  cardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  cardText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: "center",
  },
  helpGrid: {
    gap: spacing.md,
  },
  hero: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: 26,
    height: 74,
    justifyContent: "center",
    width: 74,
    ...shadow,
  },
  messageBox: {
    backgroundColor: "#F8FAFC",
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  messageLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  messageText: {
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 20,
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
    ...shadow,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 23,
    maxWidth: 320,
    textAlign: "center",
  },
  supportCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    ...shadow,
  },
  tipCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  tipCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  tipIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  tipText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  tipTitle: {
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
    textAlign: "center",
  },
  whatsappIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
});
