import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BackHeader } from "../components/BackHeader";
import { CartAddButton } from "../components/CartAddButton";
import { ScreenContainer } from "../components/ScreenContainer";
import { SearchBar } from "../components/SearchBar";
import { SectionHeader } from "../components/SectionHeader";
import { getMarketplaceStore } from "../services/marketplace.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useCartStore } from "../stores/useCartStore";
import { buildCartItem } from "../utils/checkout";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { matchesSearchText, normalizeSearchText } from "../utils/search";
import {
  colors,
  fonts,
  radius,
  shadowSoft,
  spacing,
  typography,
} from "../utils/theme";

export function StoreDetailsScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const { addItem } = useCartStore();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [mediaErrors, setMediaErrors] = useState({ banner: false, logo: false });
  const [productSearch, setProductSearch] = useState("");
  const [store, setStore] = useState(route.params?.store ?? null);
  const storeId = route.params?.lojaId;

  useEffect(() => {
    let active = true;

    async function loadStore() {
      if (!session?.accessToken || !storeId) {
        return;
      }

      setError("");
      setIsLoading(true);

      try {
        const response = await getMarketplaceStore(session.accessToken, storeId);

        if (active) {
          setStore(response.store);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message ?? "Nao foi possivel carregar esta loja.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadStore();

    return () => {
      active = false;
    };
  }, [session?.accessToken, storeId]);

  useEffect(() => {
    setMediaErrors({ banner: false, logo: false });
  }, [store?.bannerUrl, store?.logoUrl]);

  if (isLoading && !store) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} />
        <Text style={styles.stateText}>Carregando loja...</Text>
      </View>
    );
  }

  if (!store) {
    return (
      <View style={styles.centered}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={28} />
        <Text style={styles.stateText}>{error || "Loja indisponivel."}</Text>
        <BackHeader onPress={() => navigation.goBack()} title="Voltar" />
      </View>
    );
  }

  const bannerUrl = resolveMediaUrl(store.bannerUrl);
  const logoUrl = resolveMediaUrl(store.logoUrl);
  const isOpen = store.openForOrders !== false;
  const isManagedByViewer = store.isManagedByViewer === true;
  const products = store.products ?? [];
  const filteredProducts = products.filter((product) => (
    !productSearch.trim()
    || matchesSearchText(
      `${product.name} ${product.brand ?? ""} ${product.shortDescription ?? ""} ${product.description ?? ""}`,
      productSearch,
    )
  ));
  const catalogSuggestions = (() => {
    const normalized = normalizeSearchText(productSearch);
    if (normalized.length === 1) return [];

    return products
      .filter((product) => (
        !normalized
        || matchesSearchText(
          `${product.name} ${product.brand ?? ""} ${product.shortDescription ?? ""} ${product.description ?? ""}`,
          normalized,
        )
      ))
      .slice(0, 6)
      .map((product) => ({
        description: product.brand || product.shortDescription || store.name,
        iconUrl: product.imageUrl,
        id: product.id,
        label: product.name,
        type: "product",
      }));
  })();
  const featuredProduct = products.find((product) => product.featured) ?? products[0];
  const cashbackPercent = Number(store.cashbackPercent ?? 0);
  const delivery = store.delivery ?? {};
  const deliveryFeeLabel = delivery.available
    ? Number(delivery.feeCents ?? 0) > 0
      ? formatarDinheiro(delivery.feeCents)
      : "Gratis"
    : "Indisponivel";
  const deliveryMetaLabel = delivery.available
    ? `Entrega ${deliveryFeeLabel}`
    : "Sem entrega";

  function openSellerHub() {
    navigation.navigate("Main", { screen: "Vender" });
  }

  function openProduct(product) {
    navigation.navigate("ProductDetails", {
      conversationId: route.params?.conversationId,
      product,
      store,
    });
  }

  function addProduct(product) {
    addItem(buildCartItem(product), store, route.params?.conversationId);
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content} edges={["left", "right"]} padded={false}>
      <View style={styles.hero}>
        {bannerUrl && !mediaErrors.banner ? (
          <Image
            accessibilityLabel={`Banner da loja ${store.name}`}
            onError={() => setMediaErrors((current) => ({ ...current, banner: true }))}
            resizeMode="cover"
            source={{ uri: bannerUrl }}
            style={styles.bannerImage}
          />
        ) : (
          <LinearGradient
            colors={[colors.primarySoft, "#E0F2FE"]}
            style={styles.bannerFallback}
          />
        )}
        <LinearGradient
          colors={["rgba(4, 120, 87, 0.05)", "rgba(15, 23, 42, 0.72)"]}
          style={styles.heroOverlay}
        />

        <View style={styles.topBar}>
          {cashbackPercent > 0 ? (
            <View style={styles.heroCashback}>
              <Ionicons color={colors.card} name="gift-outline" size={16} />
              <Text style={styles.heroCashbackText}>{formatPercent(cashbackPercent)} cashback</Text>
            </View>
          ) : <View />}
          <View style={[styles.statusBadge, !isOpen && styles.statusBadgeClosed]}>
            <Ionicons
              color={isOpen ? colors.primaryDark : colors.warning}
              name={isOpen ? "checkmark-circle" : "pause-circle"}
              size={16}
            />
            <Text style={[styles.statusText, !isOpen && styles.statusTextClosed]}>
              {isOpen ? "Recebendo pedidos" : "Fechada agora"}
            </Text>
          </View>
        </View>

        <View style={styles.heroContent}>
          {logoUrl && !mediaErrors.logo ? (
            <Image
              accessibilityLabel={`Logo da loja ${store.name}`}
              onError={() => setMediaErrors((current) => ({ ...current, logo: true }))}
              resizeMode="contain"
              source={{ uri: logoUrl }}
              style={styles.logoImage}
            />
          ) : (
            <View style={styles.logo}>
              <Text style={styles.logoText}>{getStoreInitials(store.name)}</Text>
            </View>
          )}
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>{store.segment?.name ?? store.category?.name ?? "Loja"}</Text>
            <Text numberOfLines={2} style={styles.name}>{store.name}</Text>
            <View style={styles.heroMeta}>
              <MetaPill icon="pricetag-outline" text={store.category?.name ?? "Loja"} />
              <MetaPill icon="time-outline" text={formatTodayHours(store.openingHours, isOpen)} />
              <MetaPill icon="bicycle-outline" text={deliveryMetaLabel} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeEyebrow}>COMPRE DIRETO DA LOJA</Text>
            <Text style={styles.welcomeTitle}>Tudo pronto para o seu pedido</Text>
          </View>
          <View style={styles.verifiedSeal}>
            <Ionicons color={colors.primaryDark} name="shield-checkmark" size={17} />
            <Text style={styles.verifiedSealText}>Verificada</Text>
          </View>
        </View>

        {isManagedByViewer ? (
          <View style={styles.ownStoreNotice}>
            <View style={styles.ownStoreNoticeIcon}>
              <Ionicons color={colors.primaryDark} name="storefront" size={22} />
            </View>
            <View style={styles.ownStoreNoticeCopy}>
              <Text style={styles.ownStoreNoticeEyebrow}>SUA OPERACAO</Text>
              <Text style={styles.ownStoreNoticeTitle}>Esta e sua loja</Text>
              <Text style={styles.ownStoreNoticeText}>
                Gerencie produtos, pedidos e conversas pela Central de Vendas.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Abrir Central de Vendas"
              hitSlop={8}
              onPress={openSellerHub}
              style={({ pressed }) => [styles.ownStoreNoticeAction, pressed && styles.pressed]}
            >
              <Ionicons color={colors.card} name="arrow-forward" size={18} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.benefitBanner, cashbackPercent <= 0 && styles.benefitBannerNeutral]}>
          <View style={styles.benefitIcon}>
            <Ionicons color={colors.card} name={cashbackPercent > 0 ? "gift-outline" : "shield-checkmark-outline"} size={23} />
          </View>
          <View style={styles.benefitCopy}>
            <Text style={styles.benefitTitle}>
              {cashbackPercent > 0 ? `Ganhe ${formatPercent(cashbackPercent)} de cashback` : "Compra protegida no Brasil Cashback"}
            </Text>
            <Text style={styles.benefitText}>
              {cashbackPercent > 0 ? "O beneficio volta para sua carteira apos a conclusao." : "Pedido, conversa e pagamento ficam registrados."}
            </Text>
          </View>
          {cashbackPercent > 0 ? (
            <View style={styles.benefitValue}>
              <Text style={styles.benefitValueText}>{formatPercent(cashbackPercent)}</Text>
            </View>
          ) : null}
        </View>

        {isManagedByViewer ? (
          <Pressable
            accessibilityLabel="Atender clientes na Central de Vendas"
            onPress={openSellerHub}
            style={({ pressed }) => [styles.storeChat, styles.ownStoreChat, pressed && styles.pressed]}
          >
            <View style={styles.storeChatIcon}>
              <Ionicons color={colors.primaryDark} name="people-outline" size={20} />
            </View>
            <View style={styles.storeChatCopy}>
              <Text style={styles.storeChatTitle}>Conversas dos clientes</Text>
              <Text numberOfLines={2} style={styles.storeChatText}>
                Sua conta nao pode conversar com a propria loja.
              </Text>
            </View>
            <View style={styles.storeChatAction}>
              <Text style={styles.storeChatActionText}>Atender</Text>
              <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
            </View>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={`Falar com a loja ${store.name}`}
            onPress={() => navigation.navigate("StoreConversation", { store })}
            style={({ pressed }) => [styles.storeChat, pressed && styles.pressed]}
          >
            <View style={styles.storeChatIcon}>
              <Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={20} />
            </View>
            <View style={styles.storeChatCopy}>
              <Text style={styles.storeChatTitle}>Falar com a loja</Text>
              <Text numberOfLines={1} style={styles.storeChatText}>
                Duvidas sobre produtos, entrega ou disponibilidade
              </Text>
            </View>
            <View style={styles.storeChatAction}>
              <Text style={styles.storeChatActionText}>Conversar</Text>
              <Ionicons color={colors.primaryDark} name="arrow-forward" size={16} />
            </View>
          </Pressable>
        )}

        {featuredProduct ? (
          <FeaturedProductCard
            onAdd={() => addProduct(featuredProduct)}
            onPress={() => openProduct(featuredProduct)}
            product={featuredProduct}
          />
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            subtitle="Escolha um item para ver detalhes e quantidade"
            title="Catalogo da loja"
          />
          <SearchBar
            compact
            onChangeText={setProductSearch}
            onSelectSuggestion={(suggestion) => {
              const product = products.find((item) => Number(item.id) === Number(suggestion.id));
              if (product) openProduct(product);
              return true;
            }}
            placeholder="Buscar neste catalogo"
            suggestions={catalogSuggestions}
            value={productSearch}
          />
          {filteredProducts.length ? (
            <View style={styles.products}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  onAdd={() => addProduct(product)}
                  onPress={() => openProduct(product)}
                  product={product}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyProducts}>
              <Ionicons color={colors.primaryDark} name="cube-outline" size={24} />
              <Text style={styles.stateText}>
                Nenhum produto encontrado nessa busca.
              </Text>
            </View>
          )}
        </View>
      </View>

    </ScreenContainer>
  );
}

function FeaturedProductCard({ onAdd, onPress, product }) {
  const imageUrl = resolveMediaUrl(product.imageUrl);
  const price = product.promotionalPriceCents ?? product.priceCents;

  return (
    <View style={styles.featuredProduct}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.featuredLink, pressed && styles.pressed]}>
        {imageUrl ? (
          <Image resizeMode="cover" source={{ uri: imageUrl }} style={styles.featuredImage} />
        ) : (
          <LinearGradient colors={["#DDF8EA", "#E8F2FF"]} style={styles.featuredImageFallback}>
            <Ionicons color={colors.primaryDark} name="sparkles-outline" size={31} />
          </LinearGradient>
        )}
        <View style={styles.featuredCopy}>
          <View style={styles.featuredLabelRow}>
            <Ionicons color={colors.primaryDark} name="sparkles" size={14} />
            <Text style={styles.featuredLabel}>Destaque da loja</Text>
          </View>
          <Text numberOfLines={2} style={styles.featuredName}>{product.name}</Text>
          <Text numberOfLines={2} style={styles.featuredDescription}>
            {product.shortDescription || product.description || "Uma escolha especial desta loja."}
          </Text>
          <View style={styles.featuredFooter}>
            <View>
              {product.promotionalPriceCents ? (
                <Text style={styles.featuredOldPrice}>{formatarDinheiro(product.priceCents)}</Text>
              ) : null}
              <Text style={styles.featuredPrice}>{formatarDinheiro(price)}</Text>
            </View>
          </View>
        </View>
      </Pressable>
      <CartAddButton direction="down" name={product.name} onPress={onAdd} size={32} style={styles.featuredAdd} />
    </View>
  );
}

function MetaPill({ icon, text }) {
  return (
    <View style={styles.metaPill}>
      <Ionicons color={colors.card} name={icon} size={14} />
      <Text numberOfLines={1} style={styles.metaPillText}>{text}</Text>
    </View>
  );
}

function ProductCard({ onAdd, onPress, product }) {
  const price = product.promotionalPriceCents ?? product.priceCents;
  const imageUrl = resolveMediaUrl(product.imageUrl);
  const soldOut = product.stockControlled && Number(product.stockQuantity ?? 0) <= 0;

  return (
    <View style={[styles.productCard, soldOut && styles.productCardDisabled]}>
      <Pressable
        accessibilityLabel={`Abrir ${product.name}`}
        disabled={soldOut}
        onPress={onPress}
        style={({ pressed }) => [styles.productCardMain, pressed && styles.pressed]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.productImage} />
        ) : (
          <View style={styles.productImageFallback}>
            <Ionicons color={colors.primaryDark} name="cube-outline" size={26} />
          </View>
        )}
        <View style={styles.productCopy}>
          <View style={styles.productTitleRow}>
            <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
            {soldOut ? <Text style={styles.soldOutBadge}>Esgotado</Text> : null}
          </View>
          <Text numberOfLines={2} style={styles.productDescription}>
            {product.shortDescription || product.description || "Produto disponivel na loja."}
          </Text>
          <View style={styles.productMetaRow}>
            <Ionicons color={colors.textMuted} name="time-outline" size={13} />
            <Text numberOfLines={1} style={styles.productMetaText}>
              {formatEstimatedTime(product.estimatedTimeMinutes)}
            </Text>
            {product.unit ? (
              <Text numberOfLines={1} style={styles.productMetaText}>{product.unit}</Text>
            ) : null}
          </View>
          <View style={styles.productFooter}>
            <View style={styles.productPriceBlock}>
              {product.promotionalPriceCents ? (
                <Text style={styles.productOldPrice}>{formatarDinheiro(product.priceCents)}</Text>
              ) : null}
              <Text style={styles.productPrice}>{formatarDinheiro(price)}</Text>
            </View>
          </View>
        </View>
      </Pressable>
      {!soldOut ? <CartAddButton direction="down" name={product.name} onPress={onAdd} size={32} /> : null}
    </View>
  );
}

function getStoreInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatEstimatedTime(minutes) {
  const safeMinutes = Number(minutes ?? 0);

  if (!Number.isFinite(safeMinutes) || safeMinutes <= 0) {
    return "Prazo a combinar";
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

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function formatTodayHours(openingHours, isOpen) {
  if (!isOpen) return "Fechada agora";

  const day = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date().getDay()];
  const schedule = Array.isArray(openingHours)
    ? openingHours.find((item) => item.day === day)
    : null;

  if (!schedule?.enabled || !schedule.opensAt || !schedule.closesAt) {
    return "Aberta agora";
  }

  return `${schedule.opensAt} - ${schedule.closesAt}`;
}

const styles = StyleSheet.create({
  benefitBanner: {
    alignItems: "center",
    backgroundColor: "#E5F9EF",
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  benefitBannerNeutral: { backgroundColor: "#EEF5FF", borderColor: "#C9DDF8" },
  benefitCopy: { flex: 1, gap: 3, minWidth: 0 },
  benefitIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 44, justifyContent: "center", width: 44 },
  benefitText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  benefitTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.small, fontWeight: "800" },
  benefitValue: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.round, justifyContent: "center", minHeight: 40, minWidth: 56, paddingHorizontal: spacing.sm },
  benefitValueText: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: typography.label, fontWeight: "800" },
  bannerFallback: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    width: "100%",
  },
  body: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.xl,
    marginTop: -spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
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
  emptyProducts: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 126,
    justifyContent: "center",
    padding: spacing.lg,
  },
  featuredCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
    padding: spacing.md,
    paddingRight: 52,
  },
  featuredAdd: { bottom: spacing.md, position: "absolute", right: spacing.md },
  featuredDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption, lineHeight: 17 },
  featuredFooter: { alignItems: "flex-end", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginTop: spacing.xs },
  featuredImage: { alignSelf: "stretch", backgroundColor: colors.cardMuted, borderBottomLeftRadius: radius.lg, borderTopLeftRadius: radius.lg, minHeight: 158, width: 136 },
  featuredImageFallback: { alignItems: "center", alignSelf: "stretch", borderBottomLeftRadius: radius.lg, borderTopLeftRadius: radius.lg, justifyContent: "center", minHeight: 158, width: 136 },
  featuredLink: { flex: 1, flexDirection: "row", minWidth: 0 },
  featuredLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  featuredLabelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  featuredName: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  featuredPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  featuredOldPrice: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, textDecorationLine: "line-through" },
  featuredOpen: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 },
  featuredProduct: {
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 158,
    overflow: "visible",
    ...shadowSoft,
  },
  hero: {
    backgroundColor: colors.primarySoft,
    height: 260,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroContent: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  heroCashback: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, flexDirection: "row", gap: spacing.xs, minHeight: 34, paddingHorizontal: spacing.md },
  heroCashbackText: { color: colors.card, fontFamily: fonts.extraBold, fontSize: typography.caption, fontWeight: "800" },
  heroEyebrow: { color: "rgba(255,255,255,0.78)", fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 3,
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  logoImage: {
    backgroundColor: colors.card,
    borderColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 3,
    height: 78,
    width: 78,
  },
  logoText: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  metaPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: radius.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metaPillText: {
    color: colors.card,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  name: {
    color: colors.card,
    fontFamily: fonts.extraBold,
    fontSize: 27,
    fontWeight: "800",
    lineHeight: 31,
  },
  ownStoreChat: {
    backgroundColor: "#F7FBF9",
    borderColor: colors.border,
  },
  ownStoreNotice: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  ownStoreNoticeAction: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  ownStoreNoticeCopy: { flex: 1, gap: 2, minWidth: 0 },
  ownStoreNoticeEyebrow: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  ownStoreNoticeIcon: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  ownStoreNoticeText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  ownStoreNoticeTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  storeChat: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    padding: spacing.md,
  },
  storeChatAction: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  storeChatActionText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  storeChatCopy: { flex: 1, gap: 3, minWidth: 0 },
  storeChatIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  storeChatText: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  storeChatTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  productCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 128,
    padding: spacing.md,
    ...shadowSoft,
  },
  productCardMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    minWidth: 0,
  },
  productCardDisabled: { opacity: 0.55 },
  productCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  productDescription: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  productFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  productMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  productMetaText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  productImage: {
    borderRadius: radius.lg,
    height: 104,
    width: 104,
  },
  productImageFallback: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 104,
    justifyContent: "center",
    width: 104,
  },
  productName: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  productOldPrice: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 10, textDecorationLine: "line-through" },
  productPrice: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.label,
    fontWeight: "800",
  },
  productPriceBlock: { gap: 1 },
  productSearch: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  productSearchIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 36, justifyContent: "center", width: 36 },
  productSearchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    minHeight: 54,
  },
  productTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  products: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.lg,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: "center",
  },
  statusBadge: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusBadgeClosed: { backgroundColor: "#FFF7ED" },
  statusText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.caption,
    fontWeight: "800",
  },
  statusTextClosed: { color: colors.warning },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
    top: spacing.lg,
    zIndex: 2,
  },
  pressed: { opacity: 0.8 },
  soldOutBadge: { backgroundColor: colors.cardMuted, borderRadius: radius.round, color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700", paddingHorizontal: spacing.sm, paddingVertical: 3 },
  verifiedSeal: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryLight, borderRadius: radius.round, borderWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  verifiedSealText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  welcomeCopy: { flex: 1, gap: 3, minWidth: 0 },
  welcomeEyebrow: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10, fontWeight: "700" },
  welcomeRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  welcomeTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.h3, fontWeight: "800" },
});
