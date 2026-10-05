import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function ServiceCashbackNotice({ policy }) {
  let title = "Cashback ao pagar pelo app";
  let message = "Pague pelo app e ganhe cashback nos serviços elegíveis, inclusive no QR.";
  let unavailable = false;

  if (policy && (policy.feePercent <= 0 || policy.cashbackStartsAtCents == null)) {
    title = "Este serviço está sem cashback";
    message = "Você pode pagar pelo app, mas esta cobrança não oferece cashback.";
    unavailable = true;
  } else if (policy && policy.priorityCashbackCents === 0 && policy.retainedForPoolCents === 0) {
    title = `Cashback a partir de ${formatarDinheiro(policy.cashbackStartsAtCents)}`;
    message = "Este valor não gera cashback. O benefício depende do valor do serviço e do pagamento pelo app.";
    unavailable = true;
  } else if (policy?.priorityCashbackCents > 0) {
    title = "Ganhe cashback pagando pelo app";
    message = "Este serviço tem cashback previsto. Pague aqui ou leia o QR pelo app; pagamentos por fora não geram cashback.";
  }

  return (
    <View style={[styles.notice, unavailable && styles.unavailable]}>
      <Ionicons color={unavailable ? colors.textSecondary : colors.primaryDark} name={unavailable ? "information-circle-outline" : "gift-outline"} size={18} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: 3, minWidth: 0 },
  message: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  notice: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  title: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  unavailable: { backgroundColor: colors.cardMuted, borderColor: colors.border },
});
