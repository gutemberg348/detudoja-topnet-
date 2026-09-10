import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function LocalRewardNotice({ policy }) {
  if (!policy) return null;

  let title = "Cashback liberado";
  let message;
  let tone = "success";

  if (policy.feePercent <= 0 || policy.cashbackStartsAtCents == null) {
    title = "Compra sem cashback";
    message = "Este comercio nao possui percentual de cashback configurado para esta cobranca.";
    tone = "warning";
  } else if (!policy.processingCovered) {
    title = "Compra abaixo do valor para cashback";
    message = `A comissao desta compra ainda nao cobre a taxa de ${formatarDinheiro(policy.processingTargetCents)}. O cashback comeca em compras a partir de ${formatarDinheiro(policy.cashbackStartsAtCents)}.`;
    tone = "warning";
  } else if (policy.priorityCashbackCents === 0) {
    title = "Taxa coberta";
    message = `Nesta compra a comissao cobre a taxa. O cashback comeca a partir de ${formatarDinheiro(policy.cashbackStartsAtCents)}.`;
    tone = "warning";
  } else if (policy.retainedForPoolCents === 0) {
    message = `${formatarDinheiro(policy.priorityCashbackCents)} vai direto para o comprador. O pool completo comeca em compras a partir de ${formatarDinheiro(policy.poolStartsAtCents)}.`;
  } else {
    message = `${formatarDinheiro(policy.priorityCashbackCents)} de cashback prioritario foi preenchido. O valor restante da comissao segue para cashback, rede, indicacoes e plataforma.`;
  }

  const warning = tone === "warning";

  return (
    <View style={[styles.notice, warning && styles.noticeWarning]}>
      <View style={[styles.icon, warning && styles.iconWarning]}>
        <Ionicons
          color={warning ? colors.warning : colors.primaryDark}
          name={warning ? "alert-circle-outline" : "gift-outline"}
          size={20}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 3, minWidth: 0 },
  icon: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  iconWarning: { backgroundColor: "#FFF7E8" },
  message: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 18 },
  notice: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  noticeWarning: { backgroundColor: "#FFFBEB", borderColor: "#F5C76B" },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small, fontWeight: "700" },
});
