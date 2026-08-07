import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BrandLogo } from "../components/BrandLogo";
import { MarketplaceProductCard } from "../components/MarketplaceProductCard";
import { ScreenContainer } from "../components/ScreenContainer";
import { SearchBar } from "../components/SearchBar";
import { StatePanel } from "../components/StatePanel";
import { StoreCard } from "../components/StoreCard";
import { useMarketplaceSuggestions } from "../hooks/useMarketplaceSuggestions";
import {
  getMarketplaceCategories,
  getMarketplaceProducts,
  getMarketplaceStores,
} from "../services/marketplace.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { getServiceTypes } from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { matchesSearchText, normalizeSearchText } from "../utils/search";
import {
  colors,
  fonts,
  radius,
  spacing,
  typography,
} from "../utils/theme";

const SERVICES_CATEGORY_ID = "__servicos__";

export function StoresScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const [category, setCategory] = useState(route.params?.category ?? "todas");
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [resultMode, setResultMode] = useState(route.params?.resultMode === "products" ? "products" : "stores");
  const [serviceTypes, setServiceTypes] = useState([]);
  const [search, setSearch] = useState(route.params?.query ?? "");
  const [stores, setStores] = useState([]);
  const { suggestions } = useMarketplaceSuggestions(session?.accessToken, search, {
    limit: 8,
  });
  const isServicesCategory = category === SERVICES_CATEGORY_ID;
  const regularCategories = useMemo(
    () => categories.filter((item) => !isServiceStoreCategory(item)),
    [categories],
  );
  const selectedCategory = useMemo(
    () => regularCategories.find((item) => item.id === category) ?? null,
    [regularCategories, category],
  );
  const visibleStores = useMemo(
    () => stores.filter((store) => !isServiceStoreCategory(store.category)),
    [stores],
  );
  const matchingServiceTypes = useMemo(() => {
    const term = normalizeSearch(search);

    if (isServicesCategory) {
      return serviceTypes;
    }

    if (!term) {
      return [];
    }

    return serviceTypes.filter((serviceType) => (
      matchesSearchText(serviceType.name, term)
      || matchesSearchText(serviceType.description, term)
    ));
  }, [isServicesCategory, search, serviceTypes]);
  const showServiceResults = isServicesCategory || matchingServiceTypes.length > 0;

  useEffect(() => {
    if (route.params?.category) {
      setCategory(route.params.category);
    }
  }, [route.params?.category]);

  useEffect(() => {
    if (["stores", "products"].includes(route.params?.resultMode)) {
      setResultMode(route.params.resultMode);
    }
  }, [route.params?.resultMode]);

  useEffect(() => {
    if (typeof route.params?.query === "string") {
      setSearch(route.params.query);

      if (route.params.query.trim()) {
        setCategory("todas");
      }
    }
  }, [route.params?.query]);

  useEffect(() => {
    let active = true;

    async function loadMarketplace() {
      if (!session?.accessToken) {
        setIsLoading(false);
        return;
      }

      setError("");
      setIsLoading(true);

      try {
        const [categoriesResponse, storesResponse, productsResponse, servicesResponse] = await Promise.all([
          getMarketplaceCategories(session.accessToken),
          isServicesCategory || resultMode !== "stores"
            ? Promise.resolve({ stores: [] })
            : getMarketplaceStores(session.accessToken, {
                categoryId: category === "todas" ? "" : category,
                search,
              }),
          isServicesCategory || resultMode !== "products"
            ? Promise.resolve({ products: [] })
            : getMarketplaceProducts(session.accessToken, {
                categoryId: category === "todas" ? "" : category,
                search,
              }),
          getServiceTypes(session.accessToken),
        ]);

        if (!active) {
          return;
        }

        setCategories(categoriesResponse.categories ?? []);
        setServiceTypes(servicesResponse.serviceTypes ?? []);
        setStores(storesResponse.stores ?? []);
        setProducts(productsResponse.products ?? []);
      } catch (requestError) {
        if (active) {
          setError(requestError.message ?? "Nao foi possivel carregar as lojas.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadMarketplace();

    return () => {
      active = false;
    };
  }, [category, isServicesCategory, resultMode, search, session?.accessToken]);

  const refreshServiceTypes = useCallback(async () => {
    if (!session?.accessToken) {
      return;
    }

    try {
      const response = await getServiceTypes(session.accessToken);
      setServiceTypes(response.serviceTypes ?? []);
    } catch {
      // A tela continua com o ultimo estado valido caso a conexao oscile.
    }
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) {
      return undefined;
    }

    const socket = getRealtimeSocket(session.accessToken);
    socket?.on(realtimeEvents.serviceAvailabilityUpdated, refreshServiceTypes);

    return () => {
      socket?.off(realtimeEvents.serviceAvailabilityUpdated, refreshServiceTypes);
    };
  }, [refreshServiceTypes, session?.accessToken]);

  function openStore(store) {
    navigation.navigate("StoreDetails", { lojaId: store.id, store });
  }

  function openProduct(item) {
    navigation.navigate("ProductDetails", {
      product: item.product,
      store: item.store,
    });
  }

  function openStoreSuggestion(suggestion) {
    navigation.navigate("StoreDetails", {
      lojaId: suggestion.storeId ?? suggestion.id,
    });
  }

  function selectSuggestion(suggestion) {
    if (suggestion.type === "service") {
      const serviceType = serviceTypes.find(
        (item) => Number(item.id) === Number(suggestion.id),
      );

      if (serviceType) {
        navigation.navigate("ServiceProviders", { serviceType });
      } else {
        setCategory(SERVICES_CATEGORY_ID);
        setSearch(suggestion.label ?? "");
      }

      return true;
    }

    if (suggestion.type === "category") {
      setCategory(suggestion.id);
      setSearch("");
      return true;
    }

    if (suggestion.type === "product") {
      setCategory("todas");
      setResultMode("products");
      setSearch(suggestion.label ?? "");
      return true;
    }

    if (suggestion.type === "store") {
      openStoreSuggestion(suggestion);
      return true;
    }

    setSearch(suggestion.label ?? "");
    return true;
  }

  function changeSearch(value) {
    setSearch(value);

    if (value.trim()) {
      setCategory("todas");
    }
  }

  function submitSearch(value = search) {
    const nextSearch = value.trim();
    const directSuggestion = findDirectStoreSuggestion(nextSearch, suggestions);
    const directProduct = findDirectProductSuggestion(nextSearch, suggestions);
    const directService = serviceTypes.find(
      (serviceType) => normalizeSearch(serviceType.name) === normalizeSearch(nextSearch),
    );

    if (directProduct) {
      setCategory("todas");
      setResultMode("products");
      setSearch(directProduct.label ?? nextSearch);
      return;
    }

    if (directSuggestion) {
      openStoreSuggestion(directSuggestion);
      return;
    }

    if (directService) {
      navigation.navigate("ServiceProviders", { serviceType: directService });
      return;
    }

    if (nextSearch) {
      setCategory("todas");
    }

    setSearch(nextSearch);
  }

  function selectCategory(categoryId) {
    setCategory(categoryId);
    setSearch("");
  }

  const resultDescription = isServicesCategory
    ? "Prestadores online para atender voce"
    : search.trim()
    ? `Resultados para "${search.trim()}"`
    : selectedCategory
      ? `${resultMode === "products" ? "Produtos" : "Lojas"} em ${selectedCategory.name}`
      : resultMode === "products"
        ? "Produtos disponiveis perto de voce"
        : "Todas as lojas disponiveis";

  return (
    <ScreenContainer contentContainerStyle={styles.content} padded={false}>
      <View style={styles.hero}>
        <BrandLogo centered size="large" />

        <View style={styles.searchArea}>
          <SearchBar
            containerStyle={styles.searchBarFlex}
            onChangeText={changeSearch}
            onSelectSuggestion={selectSuggestion}
            onSubmit={submitSearch}
            placeholder="Buscar lojas, produtos ou servicos"
            showVoice
            suggestions={suggestions}
            value={search}
          />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.section}>
          <View style={styles.exploreHeader}>
            <View style={styles.exploreCopy}>
              <Text style={styles.sectionTitle}>Explorar</Text>
              <Text style={styles.sectionSubtitle}>Escolha uma categoria</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.categoryList}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <CategoryCard
              active={category === "todas"}
              icon="apps-outline"
              label="Todas"
              onPress={() => selectCategory("todas")}
            />
            <CategoryCard
              active={isServicesCategory}
              icon="briefcase-outline"
              label="Servicos"
              onPress={() => selectCategory(SERVICES_CATEGORY_ID)}
            />
            {regularCategories.map((item) => (
              <CategoryCard
                active={category === item.id}
                category={item}
                key={item.id}
                label={item.name}
                onPress={() => selectCategory(item.id)}
              />
            ))}
          </ScrollView>
        </View>

      {!isServicesCategory ? (
        <ResultModeSelector mode={resultMode} onChange={setResultMode} />
      ) : null}

      {showServiceResults ? (
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultsCopy}>
              <Text style={styles.sectionTitle}>
                {isServicesCategory ? "Servicos" : "Servicos encontrados"}
              </Text>
              <Text numberOfLines={1} style={styles.sectionSubtitle}>
                {isServicesCategory
                  ? "Escolha quem pode atender agora"
                  : `Resultados para "${search.trim()}"`}
              </Text>
            </View>
            <View style={styles.resultCount}>
              <Text style={styles.resultCountText}>{matchingServiceTypes.length}</Text>
            </View>
          </View>

          {matchingServiceTypes.length ? (
            <View style={styles.serviceList}>
              {matchingServiceTypes.map((serviceType) => (
                <ServiceTypeCard
                  key={serviceType.id}
                  onPress={() => navigation.navigate("ServiceProviders", { serviceType })}
                  serviceType={serviceType}
                />
              ))}
            </View>
          ) : (
            <StatePanel
              icon="time-outline"
              text="Assim que um prestador ficar online, ele aparece aqui automaticamente."
              title="Nenhum servico disponivel agora"
            />
          )}
        </View>
      ) : null}

      {!isServicesCategory && resultMode === "stores" ? <View style={styles.resultsSection}>
        <View style={styles.resultsHeader}>
          <View style={styles.resultsCopy}>
            <Text style={styles.sectionTitle}>Lojas</Text>
            <Text numberOfLines={1} style={styles.sectionSubtitle}>{resultDescription}</Text>
          </View>
          <View style={styles.resultCount}>
            {isLoading ? (
              <ActivityIndicator color={colors.primaryDark} size="small" />
            ) : (
              <Text style={styles.resultCountText}>{visibleStores.length}</Text>
            )}
          </View>
        </View>

        {isLoading ? (
          <StatePanel icon="storefront-outline" loading text="Buscando lojas..." />
        ) : error ? (
          <StatePanel danger icon="alert-circle-outline" text={error} title="Nao foi possivel buscar" />
        ) : visibleStores.length ? (
          <View style={styles.storeList}>
            {visibleStores.map((store) => (
              <StoreCard fluid key={store.id} store={store} onPress={openStore} />
            ))}
          </View>
        ) : (
          <StatePanel
            icon="search-outline"
            text="Nenhuma loja encontrada. Tente outra busca ou limpe os filtros."
            title="Nenhum resultado"
          />
        )}
      </View> : null}

      {!isServicesCategory && resultMode === "products" ? (
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultsCopy}>
              <Text style={styles.sectionTitle}>Produtos</Text>
              <Text numberOfLines={1} style={styles.sectionSubtitle}>{resultDescription}</Text>
            </View>
            <View style={styles.resultCount}>
              {isLoading ? (
                <ActivityIndicator color={colors.primaryDark} size="small" />
              ) : (
                <Text style={styles.resultCountText}>{products.length}</Text>
              )}
            </View>
          </View>

          {isLoading ? (
            <StatePanel icon="cube-outline" loading text="Buscando produtos..." />
          ) : error ? (
            <StatePanel danger icon="alert-circle-outline" text={error} title="Nao foi possivel buscar" />
          ) : products.length ? (
            <View style={styles.productList}>
              {products.map((item) => (
                <MarketplaceProductCard
                  item={item}
                  key={`${item.store?.id}-${item.product?.id}`}
                  onPress={openProduct}
                />
              ))}
            </View>
          ) : (
            <StatePanel
              icon="search-outline"
              text="Nenhum produto encontrado. Tente outra busca ou escolha outra categoria."
              title="Nenhum resultado"
            />
          )}
        </View>
      ) : null}
      </View>
    </ScreenContainer>
  );
}

function ResultModeSelector({ mode, onChange }) {
  return (
    <View accessibilityRole="tablist" style={styles.modeSelector}>
      <ResultModeOption
        active={mode === "stores"}
        icon="storefront-outline"
        label="Lojas"
        onPress={() => onChange("stores")}
      />
      <ResultModeOption
        active={mode === "products"}
        icon="cube-outline"
        label="Produtos"
        onPress={() => onChange("products")}
      />
    </View>
  );
}

function ResultModeOption({ active, icon, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeOption,
        active && styles.modeOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.modeIcon, active && styles.modeIconActive]}>
        <Ionicons color={active ? colors.card : colors.textSecondary} name={icon} size={17} />
      </View>
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CategoryCard({ active, category, icon, label, onPress }) {
  const iconUrl = resolveMediaUrl(category?.iconUrl);

  return (
    <Pressable
      accessibilityLabel={`Filtrar por ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryCard,
        active && styles.categoryCardActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.categoryIcon, active && styles.categoryIconActive]}>
        {iconUrl ? (
          <Image source={{ uri: iconUrl }} style={styles.categoryImage} />
        ) : (
          <Ionicons
            color={colors.primaryDark}
            name={icon ?? "storefront-outline"}
            size={24}
          />
        )}
      </View>
      <Text numberOfLines={2} style={[styles.categoryText, active && styles.categoryTextActive]}>
        {label}
      </Text>
      {active ? (
        <View style={styles.categoryCheck}>
          <Ionicons color={colors.primaryDark} name="checkmark" size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ServiceTypeCard({ onPress, serviceType }) {
  const isAvailable = Boolean(serviceType.availableNow);

  return (
    <Pressable
      accessibilityLabel={`Ver prestadores de ${serviceType.name}`}
      accessibilityState={{ disabled: !isAvailable }}
      disabled={!isAvailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceCard,
        !isAvailable && styles.serviceCardUnavailable,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.serviceIcon, !isAvailable && styles.serviceIconUnavailable]}>
        <Ionicons
          color={isAvailable ? colors.primaryDark : colors.textMuted}
          name={serviceIcon(serviceType.iconName)}
          size={22}
        />
      </View>
      <View style={styles.serviceCopy}>
        <Text style={styles.serviceName}>{serviceType.name}</Text>
        <Text numberOfLines={1} style={styles.serviceDescription}>
          {serviceType.description || "Encontre prestadores disponiveis."}
        </Text>
      </View>
      <View style={[styles.serviceStatus, !isAvailable && styles.serviceStatusOffline]}>
        <View style={[styles.serviceStatusDot, !isAvailable && styles.serviceStatusDotOffline]} />
        <Text style={[styles.serviceStatusText, !isAvailable && styles.serviceStatusTextOffline]}>
          {isAvailable ? "Disponivel" : "Indisponivel"}
        </Text>
      </View>
      <Ionicons
        color={isAvailable ? colors.primaryDark : colors.textMuted}
        name={isAvailable ? "chevron-forward" : "remove"}
        size={18}
      />
    </Pressable>
  );
}

function findDirectStoreSuggestion(value, suggestions = []) {
  const normalized = normalizeSearch(value);

  if (!normalized) {
    return null;
  }

  const directSuggestions = suggestions.filter((suggestion) => suggestion.type === "store");
  const exact = directSuggestions.find(
    (suggestion) => normalizeSearch(suggestion.label ?? suggestion.name) === normalized,
  );

  return exact ?? (directSuggestions.length === 1 ? directSuggestions[0] : null);
}

function findDirectProductSuggestion(value, suggestions = []) {
  const normalized = normalizeSearch(value);

  if (!normalized) {
    return null;
  }

  const directSuggestions = suggestions.filter((suggestion) => suggestion.type === "product");
  const exact = directSuggestions.find(
    (suggestion) => normalizeSearch(suggestion.label ?? suggestion.name) === normalized,
  );

  return exact ?? (directSuggestions.length === 1 ? directSuggestions[0] : null);
}

function normalizeSearch(value = "") {
  return normalizeSearchText(value);
}

function isServiceStoreCategory(category) {
  return normalizeSearch(category?.name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") === "servicos";
}

function serviceIcon(iconName) {
  const icons = {
    bicycle: "bicycle-outline",
    car: "car-outline",
    construct: "construct-outline",
    delivery: "cube-outline",
    person: "person-outline",
  };

  return icons[String(iconName ?? "").toLowerCase()] ?? "briefcase-outline";
}

const styles = StyleSheet.create({
  body: {
    alignSelf: "center",
    gap: spacing.xxl,
    maxWidth: 560,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    width: "100%",
    zIndex: 1,
  },
  categoryCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    height: 96,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    position: "relative",
    width: 88,
  },
  categoryCardActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  categoryCheck: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.primarySoft,
    borderRadius: radius.round,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: 5,
    top: 5,
    width: 22,
  },
  categoryIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    overflow: "hidden",
    width: 38,
  },
  categoryIconActive: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  categoryImage: { height: "100%", width: "100%" },
  categoryList: { gap: spacing.sm, paddingBottom: spacing.xs, paddingRight: spacing.sm },
  categoryText: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 15,
    maxWidth: "100%",
    minHeight: 30,
    textAlign: "center",
  },
  categoryTextActive: { color: colors.primaryDark },
  content: { paddingBottom: 0 },
  exploreCopy: { flex: 1, gap: 3 },
  exploreHeader: { alignItems: "center", flexDirection: "row" },
  hero: {
    alignItems: "center",
    backgroundColor: colors.card,
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    zIndex: 20,
  },
  modeIcon: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  modeIconActive: { backgroundColor: "rgba(255,255,255,0.16)" },
  modeOption: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  modeOptionActive: { backgroundColor: colors.primaryDark },
  modeSelector: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  modeText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    fontWeight: "700",
  },
  modeTextActive: { color: colors.card },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  productList: { gap: spacing.sm },
  resultCount: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 32,
    justifyContent: "center",
    minWidth: 32,
    paddingHorizontal: spacing.sm,
  },
  resultCountText: {
    color: colors.primaryDark,
    fontFamily: fonts.extraBold,
    fontSize: typography.small,
    fontWeight: "800",
  },
  resultsCopy: { flex: 1, gap: 3, minWidth: 0 },
  resultsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  resultsSection: { gap: spacing.md },
  searchArea: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: 520,
    width: "100%",
    zIndex: 30,
  },
  searchBarFlex: { flex: 1 },
  section: { gap: spacing.md },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: typography.caption,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.extraBold,
    fontSize: typography.h3,
    fontWeight: "800",
  },
  serviceCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    padding: spacing.md,
  },
  serviceCopy: { flex: 1, gap: 3, minWidth: 0 },
  serviceCardUnavailable: { backgroundColor: colors.backgroundSoft, opacity: 0.72 },
  serviceDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  serviceIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  serviceIconUnavailable: { backgroundColor: colors.cardMuted },
  serviceList: { gap: spacing.sm },
  serviceName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  serviceStatus: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  serviceStatusDot: { backgroundColor: colors.success, borderRadius: radius.round, height: 6, width: 6 },
  serviceStatusDotOffline: { backgroundColor: colors.textMuted },
  serviceStatusOffline: { backgroundColor: colors.cardMuted },
  serviceStatusText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  serviceStatusTextOffline: { color: colors.textMuted },
  storeList: { gap: spacing.sm },
});
