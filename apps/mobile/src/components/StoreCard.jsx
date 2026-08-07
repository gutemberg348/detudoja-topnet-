import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

export function StoreCard({ compact = false, fluid = false, onPress, store }) {
  const categoryName = store?.category?.name ?? "Loja";
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = resolveMediaUrl(store?.logoUrl);
  const cashbackPercent = Number(store?.cashbackPercent ?? 0);
  const actionLabel = store?.orderFlow === "CHAT_NEGOTIATION"
    ? "Pedir pelo chat"
    : "Ver loja";

  return (
    <Pressable
      accessibilityLabel={`Abrir loja ${store?.name ?? ""}`}
      accessibilityRole="button"
      onPress={() => onPress?.(store)}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        fluid && styles.fluid,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.storeIcon}>
          {logoUrl && !logoFailed ? (
            <Image
              accessibilityLabel={`Logo da loja ${store?.name ?? ""}`}
              onError={() => setLogoFailed(true)}
              resizeMode="contain"
              source={{ uri: logoUrl }}
              style={styles.logo}
            />
          ) : (
            <Ionicons color={colors.primaryDark} name="storefront-outline" size={23} />
          )}
        </View>
        <View style={styles.topCopy}>
          <View style={styles.labelRow}>
            <Text numberOfLines={1} style={styles.category}>{categoryName}</Text>
            {cashbackPercent > 0 ? (
              <View style={styles.cashbackBadge}>
                <View style={styles.cashbackIcon}>
                  <Ionicons color={colors.card} name="cash-outline" size={13} />
                </View>
                <Text style={styles.cashbackRate}>{formatPercent(cashbackPercent)}%</Text>
                <Text style={styles.cashbackText}>cashback</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.name}>{store?.name ?? "Loja"}</Text>
          <Text numberOfLines={2} style={styles.description}>
            {store?.description || "Produtos e servicos para voce comprar com praticidade."}
          </Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={18} />
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.storeStatus}>
          <View style={[
            styles.storeStatusDot,
            !store?.openForOrders && styles.storeStatusDotClosed,
          ]} />
          <Text style={[
            styles.storeStatusText,
            !store?.openForOrders && styles.storeStatusTextClosed,
          ]}>
            {store?.openForOrders ? "Recebendo pedidos" : "Indisponivel agora"}
          </Text>
        </View>
        <View style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons color={colors.primaryDark} name="arrow-forward" size={15} />
        </View>
      </View>
    </Pressable>
  );
}

function formatPercent(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

const styles = StyleSheet.create({
  arrow: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexShrink: 0,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    width: 322,
    ...shadowSoft,
  },
  cashbackBadge: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderColor: "#0A6F54",
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
    minHeight: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cashbackIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.round,
    height: 17,
    justifyContent: "center",
    marginRight: 1,
    width: 17,
  },
  cashbackRate: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 11,
    fontWeight: "800",
  },
  cashbackText: {
    color: "#D9FBEA",
    fontFamily: fonts.semiBold,
    fontSize: 9,
    fontWeight: "600",
  },
  category: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  compact: {
    width: 280,
  },
  fluid: {
    width: "100%",
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 16,
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  logo: {
    height: "100%",
    width: "100%",
  },
  cardFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: spacing.md,
    minHeight: 44,
  },
  name: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  storeIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 62,
    justifyContent: "center",
    width: 62,
  },
  storeStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  storeStatusDot: {
    backgroundColor: colors.success,
    borderRadius: radius.round,
    height: 6,
    width: 6,
  },
  storeStatusDotClosed: { backgroundColor: colors.textMuted },
  storeStatusText: {
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
    fontSize: 11,
  },
  storeStatusTextClosed: { color: colors.textMuted },
  topCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  topRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  action: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  actionText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: "700",
  },
});
