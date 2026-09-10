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
const RESULT_MODES = ["stores", "products", "services"];

function initialResultMode(route) {
  if (route.params?.category === SERVICES_CATEGORY_ID) return "services";
  return RESULT_MODES.includes(route.params?.resultMode) ? route.params.resultMode : "stores";
}

export function StoresScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const [category, setCategory] = useState(
    route.params?.category === SERVICES_CATEGORY_ID ? "todas" : route.params?.category ?? "todas",
  );
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [marketplaceSearch, setMarketplaceSearch] = useState(route.params?.query ?? "");
  const [products, setProducts] = useState([]);
  const [resultMode, setResultMode] = useState(() => initialResultMode(route));
  const [serviceTypes, setServiceTypes] = useState([]);
  const [search, setSearch] = useState(route.params?.query ?? "");
  const [stores, setStores] = useState([]);
  const { suggestions } = useMarketplaceSuggestions(session?.accessToken, search, {
    limit: 8,
  });
  const hasSearch = Boolean(search.trim());
  const hasMarketplaceSearch = Boolean(marketplaceSearch.trim());
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

    if (resultMode === "services" && !term) {
      return serviceTypes;
    }

    if (!term) {
      return [];
    }

    return serviceTypes.filter((serviceType) => (
      matchesSearchText(serviceType.name, term)
      || matchesSearchText(serviceType.description, term)
    ));
  }, [resultMode, search, serviceTypes]);
  const showServiceResults = resultMode === "services";
  const showStoreResults = resultMode === "stores";
  const showProductResults = resultMode === "products";
  const hasAnySearchResult = Boolean(
    matchingServiceTypes.length || visibleStores.length || products.length,
  );
  const showGlobalEmptySearch = hasSearch
    && !isLoading
    && !error
    && !hasAnySearchResult;

  useEffect(() => {
    if (route.params?.category) {
      if (route.params.category === SERVICES_CATEGORY_ID) {
        setCategory("todas");
        setResultMode("services");
      } else {
        setCategory(route.params.category);
      }
    }
  }, [route.params?.category]);

  useEffect(() => {
    if (RESULT_MODES.includes(route.params?.resultMode)) {
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
    setIsLoading(true);
    const timeout = setTimeout(() => setMarketplaceSearch(search), 280);
    return () => clearTimeout(timeout);
  }, [search]);

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
          !hasMarketplaceSearch && resultMode !== "stores"
            ? Promise.resolve({ stores: [] })
            : getMarketplaceStores(session.accessToken, {
                categoryId: category === "todas" ? "" : category,
                search: marketplaceSearch,
              }),
          !hasMarketplaceSearch && resultMode !== "products"
            ? Promise.resolve({ products: [] })
            : getMarketplaceProducts(session.accessToken, {
                categoryId: category === "todas" ? "" : category,
                search: marketplaceSearch,
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
  }, [category, hasMarketplaceSearch, marketplaceSearch, resultMode, session?.accessToken]);

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
        setCategory("todas");
        setResultMode("services");
        setSearch(suggestion.label ?? "");
      }

      return true;
    }

    if (suggestion.type === "category") {
      setCategory(suggestion.id);
      setResultMode("stores");
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

  const resultDescription = search.trim()
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
        <ResultModeSelector mode={resultMode} onChange={(mode) => {
          setResultMode(mode);
          setCategory("todas");
        }} />

        {hasSearch ? (
          <View style={styles.globalSearchHint}>
            <Ionicons color={colors.primaryDark} name="search-outline" size={16} />
            <Text style={styles.globalSearchHintText}>Buscando em lojas, produtos e servicos</Text>
          </View>
        ) : null}

        {!hasSearch && resultMode !== "services" ? <View style={styles.section}>
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
        </View> : null}

      {showServiceResults ? (
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultsCopy}>
              <Text style={styles.sectionTitle}>
                {hasSearch ? "Servicos encontrados" : "Servicos"}
              </Text>
              <Text numberOfLines={1} style={styles.sectionSubtitle}>
                {!hasSearch
                  ? "Escolha uma atividade para encontrar atendimento"
                  : `Resultados para "${search.trim()}"`}
              </Text>
            </View>
            <View style={styles.resultCount}>
              <Text style={styles.resultCountText}>{matchingServiceTypes.length}</Text>
            </View>
          </View>

          {isLoading && !serviceTypes.length ? (
            <StatePanel icon="briefcase-outline" loading text="Buscando servicos..." />
          ) : matchingServiceTypes.length ? (
            <View style={styles.serviceList}>
              {matchingServiceTypes.map((serviceType) => (
                <ServiceTypeCard
                  key={serviceType.id}
                  onPress={() => navigation.navigate("ServiceProviders", { serviceType })}
                  serviceType={serviceType}
                />
              ))}
            </View>
          ) : !hasSearch ? (
            <StatePanel
              icon="time-outline"
              text="Assim que um prestador ficar online, ele aparece aqui automaticamente."
              title="Nenhum servico disponivel agora"
            />
          ) : null}
        </View>
      ) : null}

      {showStoreResults ? <View style={styles.resultsSection}>
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
        ) : !hasSearch ? (
          <StatePanel
            icon="search-outline"
            text="Nenhuma loja encontrada. Tente outra busca ou limpe os filtros."
            title="Nenhum resultado"
          />
        ) : null}
      </View> : null}

      {showProductResults ? (
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
              {chunkItems(products, 2).map((row, rowIndex) => (
                <View
                  key={`product-row-${rowIndex}-${row[0]?.product?.id ?? "empty"}`}
                  style={styles.productRow}
                >
                  {row.map((item) => (
                    <MarketplaceProductCard
                      item={item}
                      key={`${item.store?.id}-${item.product?.id}`}
                      onPress={openProduct}
                      style={styles.productGridCard}
                      variant="grid"
                    />
                  ))}
                  {row.length < 2 ? <View style={styles.productGridSpacer} /> : null}
                </View>
              ))}
            </View>
          ) : !hasSearch ? (
            <StatePanel
              icon="search-outline"
              text="Nenhum produto encontrado. Tente outra busca ou escolha outra categoria."
              title="Nenhum resultado"
            />
          ) : null}
        </View>
      ) : null}

      {showGlobalEmptySearch ? (
        <StatePanel
          icon="search-outline"
          text="Tente outro nome, produto, categoria ou servico."
          title="Nenhum resultado para esta busca"
        />
      ) : null}
      </View>
    </ScreenContainer>
  );
}

function chunkItems(items, size) {
  const rows = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
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
        icon="bag-handle-outline"
        label="Produtos"
        onPress={() => onChange("products")}
      />
      <ResultModeOption
        active={mode === "services"}
        icon="briefcase-outline"
        label="Servicos"
        onPress={() => onChange("services")}
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
  const visual = serviceVisual(serviceType);

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
      <View style={[styles.serviceIcon, { backgroundColor: visual.background }, !isAvailable && styles.serviceIconUnavailable]}>
        <Ionicons
          color={isAvailable ? visual.color : colors.textMuted}
          name={visual.icon}
          size={26}
        />
      </View>
      <View style={styles.serviceCopy}>
        <Text style={[styles.serviceEyebrow, { color: isAvailable ? visual.color : colors.textMuted }]}>
          {serviceType.operationalType === "ENTREGA_LOCAL" ? "ENTREGA" : "SERVICO LOCAL"}
        </Text>
        <Text style={styles.serviceName}>{serviceType.name}</Text>
        <Text numberOfLines={2} style={styles.serviceDescription}>
          {serviceType.description || "Encontre prestadores disponiveis."}
        </Text>
        <View style={styles.serviceFooter}>
          <View style={[styles.serviceStatus, !isAvailable && styles.serviceStatusOffline]}>
            <View style={[styles.serviceStatusDot, !isAvailable && styles.serviceStatusDotOffline]} />
            <Text style={[styles.serviceStatusText, !isAvailable && styles.serviceStatusTextOffline]}>
              {isAvailable ? "Disponivel agora" : "Indisponivel"}
            </Text>
          </View>
          {isAvailable ? <Text style={styles.serviceAction}>Ver opcoes</Text> : null}
        </View>
      </View>
      <View style={[styles.serviceArrow, !isAvailable && styles.serviceArrowUnavailable]}>
        <Ionicons
          color={isAvailable ? visual.color : colors.textMuted}
          name={isAvailable ? "arrow-forward" : "remove"}
          size={17}
        />
      </View>
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

function serviceVisual(serviceType) {
  const value = normalizeSearch([
    serviceType?.slug,
    serviceType?.name,
    serviceType?.iconName,
  ].filter(Boolean).join(" "));

  if (/moto|entrega|delivery|bicycle/.test(value)) {
    return { background: "#EAF2FF", color: "#2563EB", icon: "bicycle-outline" };
  }
  if (/frete|mudanca|carga|car/.test(value)) {
    return { background: "#FFF4E5", color: "#C56A00", icon: "car-outline" };
  }
  if (/limpeza|faxina|terreno/.test(value)) {
    return { background: "#F2EDFF", color: "#7C3AED", icon: "sparkles-outline" };
  }
  if (/beleza|cabelo|unha|estetica/.test(value)) {
    return { background: "#FFF0F6", color: "#DB2777", icon: "cut-outline" };
  }
  if (/reparo|manutencao|constr|eletric|encan/.test(value)) {
    return { background: "#FFF7E6", color: "#B77900", icon: "construct-outline" };
  }
  if (/aula|professor|educa/.test(value)) {
    return { background: "#EEF2FF", color: "#4F46E5", icon: "school-outline" };
  }

  return {
    background: colors.primarySoft,
    color: colors.primaryDark,
    icon: serviceIcon(serviceType?.iconName),
  };
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
  globalSearchHint: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  globalSearchHintText: { color: colors.primaryDark, fontFamily: fonts.semiBold, fontSize: 10 },
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
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  modeIconActive: { backgroundColor: "rgba(255,255,255,0.16)" },
  modeOption: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.xs,
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
    fontSize: 11,
    fontWeight: "700",
  },
  modeTextActive: { color: colors.card },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  productList: {
    gap: spacing.sm,
  },
  productGridCard: { flex: 1 },
  productGridSpacer: { flex: 1, minWidth: 0 },
  productRow: { alignItems: "stretch", flexDirection: "row", gap: spacing.sm },
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
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 116,
    padding: spacing.lg,
  },
  serviceAction: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  serviceArrow: {
    alignItems: "center",
    backgroundColor: colors.cardMuted,
    borderRadius: radius.round,
    height: 32,
    justifyContent: "center",
    marginTop: 10,
    width: 32,
  },
  serviceArrowUnavailable: { backgroundColor: colors.backgroundSoft },
  serviceCopy: { flex: 1, gap: 4, minWidth: 0 },
  serviceCardUnavailable: { backgroundColor: colors.backgroundSoft, opacity: 0.72 },
  serviceDescription: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  serviceEyebrow: { fontFamily: fonts.extraBold, fontSize: 9 },
  serviceFooter: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginTop: spacing.xs },
  serviceIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  serviceIconUnavailable: { backgroundColor: colors.cardMuted },
  serviceList: { gap: spacing.sm },
  serviceName: { color: colors.textPrimary, fontFamily: fonts.extraBold, fontSize: typography.body },
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
