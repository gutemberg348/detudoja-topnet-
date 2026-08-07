import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

export function MarketplaceProductCard({ item, onPress }) {
  const [imageFailed, setImageFailed] = useState(false);
  const product = item?.product ?? {};
  const store = item?.store ?? {};
  const imageUrl = resolveMediaUrl(product.imageUrl);
  const currentPrice = product.promotionalPriceCents ?? product.priceCents;
  const soldOut = product.stockControlled && Number(product.stockQuantity ?? 0) <= 0;
  const cashbackPercent = Number(store.cashbackPercent ?? 0);

  return (
    <Pressable
      accessibilityLabel={`Abrir produto ${product.name ?? ""}`}
      accessibilityRole="button"
      disabled={soldOut}
      onPress={() => onPress?.(item)}
      style={({ pressed }) => [
        styles.card,
        soldOut && styles.cardDisabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.media}>
        {imageUrl && !imageFailed ? (
          <Image
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: imageUrl }}
            style={styles.image}
          />
        ) : (
          <View style={styles.imageFallback}>
            <Ionicons color={colors.primaryDark} name="cube-outline" size={27} />
          </View>
        )}
        {product.featured ? (
          <View style={styles.featuredBadge}>
            <Ionicons color={colors.warning} name="star" size={11} />
          </View>
        ) : null}
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.storeName}>{store.name ?? "Loja"}</Text>
        <Text numberOfLines={1} style={styles.productName}>{product.name ?? "Produto"}</Text>
        <Text numberOfLines={2} style={styles.description}>
          {product.shortDescription || product.description || "Disponivel para comprar pelo app."}
        </Text>

        <View style={styles.footer}>
          <View style={styles.priceBlock}>
            {product.promotionalPriceCents ? (
              <Text style={styles.oldPrice}>{formatarDinheiro(product.priceCents)}</Text>
            ) : null}
            <Text style={styles.price}>{formatarDinheiro(currentPrice)}</Text>
          </View>
          {cashbackPercent > 0 ? (
            <View style={styles.cashback}>
              <Ionicons color={colors.primaryDark} name="cash-outline" size={13} />
              <Text style={styles.cashbackText}>{formatPercent(cashbackPercent)} de volta</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.arrow}>
        <Ionicons color={colors.primaryDark} name="chevron-forward" size={18} />
      </View>
    </Pressable>
  );
}

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

const styles = StyleSheet.create({
  arrow: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  cashback: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  cashbackText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 118,
    padding: spacing.md,
    ...shadowSoft,
  },
  cardDisabled: { opacity: 0.55 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 16,
  },
  featuredBadge: {
    alignItems: "center",
    backgroundColor: colors.warningSoft,
    borderRadius: radius.round,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 5,
    top: 5,
    width: 24,
  },
  footer: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: 4,
  },
  image: { height: "100%", width: "100%" },
  imageFallback: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  media: {
    backgroundColor: colors.cardMuted,
    borderRadius: radius.lg,
    height: 90,
    overflow: "hidden",
    position: "relative",
    width: 90,
  },
  oldPrice: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 10,
    textDecorationLine: "line-through",
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  price: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  priceBlock: { gap: 1 },
  productName: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  storeName: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
});
