import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

export function MovementItem({ item, onPress }) {
  const isDebit = item.tipo === "DEBITO";
  const statusLabel = item.status === "PENDENTE" ? "Libera em ate 24h" : item.status;

  return (
    <Pressable
      accessibilityHint="Abre os detalhes desta movimentacao"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.icon, isDebit ? styles.iconDebit : styles.iconCredit]}>
        <Ionicons
          color={isDebit ? "#C2410C" : colors.primaryDark}
          name={isDebit ? "arrow-up" : "arrow-down"}
          size={18}
        />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>
          {item.displayTitle ?? item.tipo}
        </Text>
        <Text numberOfLines={1} style={styles.description}>
          {item.summary ?? item.descricao} - {item.data}
        </Text>
      </View>
      <View style={styles.valueBlock}>
        <Text style={[styles.value, isDebit ? styles.valueDebit : styles.valueCredit]}>
          {isDebit ? "-" : "+"}
          {formatarDinheiro(Math.abs(item.valor_centavos))}
        </Text>
        <View style={styles.detailHint}>
          <Text style={styles.status}>{statusLabel}</Text>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={13} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  detailHint: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconCredit: {
    backgroundColor: colors.primarySoft,
  },
  iconDebit: {
    backgroundColor: "#FFF4ED",
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    opacity: 0.68,
  },
  status: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: typography.caption,
    textAlign: "right",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.semiBold,
    fontSize: typography.label,
    fontWeight: "600",
  },
  value: {
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  valueBlock: {
    alignItems: "flex-end",
    gap: 3,
  },
  valueCredit: {
    color: colors.primaryDark,
  },
  valueDebit: {
    color: colors.textPrimary,
  },
});
