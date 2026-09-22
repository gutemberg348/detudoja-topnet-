import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { BackHeader } from "../components/BackHeader";
import { ScreenContainer } from "../components/ScreenContainer";
import { trackStoreConversationActivity } from "../services/store-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCartStore } from "../stores/useCartStore";
import { buildCartItem, productPriceCents } from "../utils/checkout";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import {
  colors,
  fonts,
  radius,
  spacing,
  typography,
} from "../utils/theme";

export function ProductDetailsScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const { addItem, itemCount } = useCartStore();
  const product = route.params?.product;
  const store = route.params?.store;
  const conversationId = route.params?.conversationId;
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [storeLogoFailed, setStoreLogoFailed] = useState(false);

  if (!product || !store) {
    return (
      <View style={styles.centered}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={28} />
        <Text style={styles.stateText}>Produto indisponivel.</Text>
        <BackHeader onPress={() => navigation.goBack()} title="Voltar" />
      </View>
    );
  }

  const imageUrl = resolveMediaUrl(product.imageUrl);
  const storeLogoUrl = resolveMediaUrl(store.logoUrl);
  const priceCents = productPriceCents(product);
  const totalCents = priceCents * quantity;
  const item = buildCartItem(product, { notes, quantity });
  const cartParams = { conversationId, items: [item], store };

  function changeQuantity(nextQuantity) {
    setQuantity(Math.max(1, Math.min(nextQuantity, 99)));
  }

  function track(action) {
    if (!conversationId || !session?.accessToken) return;
    void trackStoreConversationActivity(session.accessToken, conversationId, {
      action,
      productId: product.id,
    }).catch(() => {});
  }

  function addToCart() {
    track("ADD_TO_CART");
    addItem(item, store, conversationId);
    navigation.navigate("Cart");
  }

  function buyNow() {
    track("START_CHECKOUT");
    navigation.navigate("Checkout", cartParams);
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]} padded={false}>
      <View style={styles.hero}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.heroImage} />
        ) : (
          <LinearGradient
            colors={[colors.primarySoft, "#E0F2FE"]}
            style={styles.heroFallback}
          >
            <Ionicons color={colors.primaryDark} name="cube-outline" size={46} />
          </LinearGradient>
        )}
        <LinearGradient
          colors={["rgba(15,23,42,0.06)", "rgba(15,23,42,0.44)"]}
          style={styles.heroOverlay}
        />
        <View style={styles.topBar}>
          {itemCount > 0 ? (
            <Pressable
              accessibilityLabel={`Abrir carrinho com ${itemCount} itens`}
              onPress={() => navigation.navigate("Cart")}
              style={styles.roundButton}
            >
              <Ionicons color={colors.textPrimary} name="bag-handle-outline" size={22} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <Pressable
          accessibilityLabel={`Abrir loja ${store.name}`}
          onPress={() => navigation.navigate("StoreConversation", {
            conversationId,
            store,
            storeId: store.id,
          })}
          style={styles.storeBrand}
        >
          <View style={styles.storeBrandLogo}>
            {storeLogoUrl && !storeLogoFailed ? (
              <Image
                accessibilityLabel={`Logo da loja ${store.name}`}
                onError={() => setStoreLogoFailed(true)}
                resizeMode="contain"
                source={{ uri: storeLogoUrl }}
                style={styles.storeBrandLogoImage}
              />
            ) : (
              <Ionicons color={colors.primaryDark} name="storefront-outline" size={20} />
            )}
          </View>
          <View style={styles.storeBrandCopy}>
            <Text style={styles.storeBrandLabel}>Vendido por</Text>
            <Text numberOfLines={1} style={styles.storeName}>{store.name}</Text>
          </View>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={18} />
        </Pressable>

        <View style={styles.kickerRow}>
          <Text style={styles.productCategory}>{store.category?.name ?? "Produto da loja"}</Text>
          {product.featured ? <Text style={styles.featuredBadge}>Destaque</Text> : null}
        </View>

        <Text style={styles.title}>{product.name}</Text>
        <Text style={styles.description}>
          {product.description || product.shortDescription ||
            "Produto disponivel para compra online. Os detalhes completos serao expandidos conforme o tipo de loja."}
        </Text>

        <View style={styles.infoGrid}>
          <InfoTile
            icon="time-outline"
            label={formatEstimatedTime(product.estimatedTimeMinutes)}
          />
          <InfoTile icon="card-outline" label="Saldo ou Pix" />
          <InfoTile
            icon={product.acceptDelivery ? "bicycle-outline" : "bag-check-outline"}
            label={product.acceptDelivery ? "Entrega" : "Retirada"}
          />
        </View>

        <View style={styles.detailsPanel}>
          <DetailRow label="Loja" value={store.name} />
          {product.brand ? <DetailRow label="Marca" value={product.brand} /> : null}
          <DetailRow label="Unidade" value={product.unit ?? "unidade"} />
          <DetailRow label="Disponibilidade" value={productAvailability(product)} />
          {product.sku ? <DetailRow label="Codigo" value={product.sku} /> : null}
          {product.details?.extraInfo ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.extraInfo}>{product.details.extraInfo}</Text>
            </>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantidade</Text>
          <View style={styles.quantityRow}>
            <Pressable
              onPress={() => changeQuantity(quantity - 1)}
              style={styles.quantityButton}
            >
              <Ionicons color={colors.primaryDark} name="remove" size={20} />
            </Pressable>
            <Text style={styles.quantityText}>{quantity}</Text>
            <Pressable
              onPress={() => changeQuantity(quantity + 1)}
              style={styles.quantityButton}
            >
              <Ionicons color={colors.primaryDark} name="add" size={20} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observacao</Text>
          <View style={styles.notesBox}>
            <TextInput
              multiline
              onChangeText={setNotes}
              placeholder="Ex.: sem cebola, entregar na portaria, cor preferida..."
              placeholderTextColor={colors.textMuted}
              style={styles.notesInput}
              value={notes}
            />
          </View>
        </View>

        <View style={styles.detailsPanel}>
          <DetailRow label="Preco unitario" value={formatarDinheiro(priceCents)} />
          <DetailRow label="Quantidade" value={`${quantity} un.`} />
          <View style={styles.divider} />
          <DetailRow strong label="Total do produto" value={formatarDinheiro(totalCents)} />
        </View>

        <View style={styles.bottomActions}>
          <AppButton
            icon="bag-add-outline"
            onPress={addToCart}
            title="Adicionar ao carrinho"
            variant="outline"
          />
          <AppButton
            icon="card-outline"
            onPress={buyNow}
            title={`Comprar agora - ${formatarDinheiro(totalCents)}`}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function DetailRow({ label, strong = false, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, strong && styles.detailStrong]}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.detailStrong]}>{value}</Text>
    </View>
  );
}

function InfoTile({ icon, label }) {
  return (
    <View style={styles.infoTile}>
      <Ionicons color={colors.primaryDark} name={icon} size={19} />
      <Text style={styles.infoTileText}>{label}</Text>
    </View>
  );
}

function formatEstimatedTime(minutes) {
  const safeMinutes = Number(minutes ?? 0);

  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) {
    return "Prazo a confirmar";
  }

  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  if (safeMinutes < 1440) {
    const hours = Math.round((safeMinutes / 60) * 10) / 10;
    return `${String(hours).replace(".", ",")} h`;
  }

  const days = Math.round((safeMinutes / 1440) * 10) / 10;
  return `${String(days).replace(".", ",")} dia${days > 1 ? "s" : ""}`;
}

function productAvailability(product) {
  const options = [
    product.acceptDelivery ? "entrega" : null,
    product.acceptPickup ? "retirada" : null,
  ].filter(Boolean);

  return options.length ? options.join(" + ") : "a confirmar";
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    gap: spacing.xl,
    marginTop: -26,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  bottomActions: {
    gap: spacing.md,
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.xl,
  },
  content: {
    backgroundColor: colors.background,
    paddingBottom: spacing.xxxl,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailStrong: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.body,
    fontWeight: "800",
  },
  detailValue: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  detailsPanel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  extraInfo: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    lineHeight: 20,
  },
  featuredBadge: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.round,
    color: colors.warning,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
    fontWeight: "800",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  hero: {
    backgroundColor: colors.primarySoft,
    height: 280,
  },
  heroFallback: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  infoGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  infoTile: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 74,
    justifyContent: "center",
    padding: spacing.sm,
  },
  infoTileText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  kickerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  notesBox: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  notesInput: {
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    minHeight: 92,
    textAlignVertical: "top",
  },
  quantityButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  quantityRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xl,
    padding: spacing.sm,
  },
  quantityText: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
    minWidth: 28,
    textAlign: "center",
  },
  roundButton: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: "center",
  },
  storeName: {
    color: colors.primaryDark,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  storeBrand: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  storeBrandCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  storeBrandLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  storeBrandLogo: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    width: 42,
  },
  storeBrandLogoImage: {
    height: "100%",
    width: "100%",
  },
  productCategory: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 33,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
    top: spacing.lg,
  },
});
