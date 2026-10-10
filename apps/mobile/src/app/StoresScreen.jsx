import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BrandLogo } from "../components/BrandLogo";
import { MarketplaceLocationModal } from "../components/MarketplaceLocationModal";
import { MarketplaceProductCard } from "../components/MarketplaceProductCard";
import { MarketplaceCategoryCard } from "../components/MarketplaceCategoryCard";
import { ScreenContainer } from "../components/ScreenContainer";
import { SearchBar } from "../components/SearchBar";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { StatePanel } from "../components/StatePanel";
import { StoreCard } from "../components/StoreCard";
import { useMarketplaceSuggestions } from "../hooks/useMarketplaceSuggestions";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { useMarketplaceProducts } from "../hooks/useMarketplaceProducts";
import { marketplaceKey, marketplaceLocationKey, useMarketplaceLocation, usePrefetchMarketplace } from "../hooks/useMarketplaceData";
import {
  getMarketplaceCategories,
  getMarketplaceStores,
} from "../services/marketplace.api";
import { realtimeEvents } from "../services/realtime";
import { getServiceTypes } from "../services/service-chats.api";
import { updateCurrentUser } from "../services/users.api";
import { readCache } from "../services/read-cache";
import { useAuthStore } from "../stores/useAuthStore";
import { matchesSearchText, normalizeSearchText, serviceSearchScore, isServiceSearch } from "../utils/search";
import { serviceIconName } from "../utils/service-icons";
import {
  colors,
  fonts,
  radius,
  spacing,
  typography,
} from "../utils/theme";

const SERVICES_CATEGORY_ID = "__servicos__";
const RESULT_MODES = ["stores", "products", "services"];
const EMPTY_ITEMS = [];

function initialResultMode(route) {
  if (route.params?.category === SERVICES_CATEGORY_ID) return "services";
  return RESULT_MODES.includes(route.params?.resultMode) ? route.params.resultMode : "stores";
}

export function StoresScreen({ navigation, route }) {
  const { session } = useAuthStore();
  const focused = useIsFocused();
  const [category, setCategory] = useState(
    route.params?.category === SERVICES_CATEGORY_ID ? "todas" : route.params?.category ?? "todas",
  );
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [marketplaceSearch, setMarketplaceSearch] = useState(route.params?.query ?? "");
  const [resultMode, setResultMode] = useState(() => initialResultMode(route));
  const [searchFocused, setSearchFocused] = useState(false);
  const [search, setSearch] = useState(route.params?.query ?? "");
  const listRef = useRef(null);
  const locationQuery = useMarketplaceLocation();
  const marketplaceLocation = locationQuery.location;
  const canLoad = focused && Boolean(session?.accessToken && session?.user?.id && marketplaceLocation);
  const hasMarketplaceSearch = Boolean(marketplaceSearch.trim());
  const params = { categoryId: category === "todas" ? "" : category, search: marketplaceSearch };
  const categoriesQuery = useCachedQuery({
    key: marketplaceLocation ? marketplaceKey("categories", session?.user?.id, marketplaceLocation) : null,
    enabled: canLoad,
    load: () => getMarketplaceCategories(session.accessToken),
    requestVersion: session?.accessToken,
    staleTimeMs: 60000,
  });
  const servicesQuery = useCachedQuery({
    key: marketplaceLocation ? marketplaceKey("service-types", session?.user?.id, marketplaceLocation) : null,
    enabled: canLoad,
    load: () => getServiceTypes(session.accessToken),
    requestVersion: session?.accessToken,
    staleTimeMs: 10000,
  });
  const storesQuery = useCachedQuery({
    key: marketplaceLocation ? marketplaceKey("stores", session?.user?.id, marketplaceLocation, params) : null,
    enabled: canLoad && (hasMarketplaceSearch || resultMode === "stores"),
    load: () => getMarketplaceStores(session.accessToken, params),
    requestVersion: session?.accessToken,
  });
  const productsQuery = useMarketplaceProducts({
    key: marketplaceLocation ? marketplaceKey("products", session?.user?.id, marketplaceLocation, params) : null,
    enabled: canLoad && (hasMarketplaceSearch || resultMode === "products"),
    accessToken: session?.accessToken,
    params,
  });
  const categories = categoriesQuery.data?.categories ?? EMPTY_ITEMS;
  const serviceTypes = servicesQuery.data?.serviceTypes ?? EMPTY_ITEMS;
  const stores = storesQuery.data?.stores ?? EMPTY_ITEMS;
  const products = productsQuery.data?.products ?? EMPTY_ITEMS;
  const productRows = useMemo(() => chunkItems(products, 2), [products]);
  usePrefetchMarketplace(marketplaceLocation, {
    categoryId: params.categoryId,
    resultMode: resultMode === "stores" ? "products" : "stores",
    ready: !search.trim() && !searchFocused && (
      (resultMode === "stores" && storesQuery.hasData) || (resultMode === "products" && productsQuery.hasData)
    ),
  });
  const { isLoading: suggestionsLoading, suggestions, searchInfo, error: suggestionsError, retry: retrySuggestions } = useMarketplaceSuggestions(session?.accessToken, search, {
    enabled: focused && Boolean(marketplaceLocation) && searchFocused,
    limit: 12,
    minimumCharacters: 2,
    scope: marketplaceLocation
      ? `${marketplaceLocation.city}|${marketplaceLocation.state}`
      : "",
    showInitial: true,
  });
  const hasSearch = Boolean(search.trim());
  const regularCategories = useMemo(
    () => categories.filter((item) => !isServiceStoreCategory(item)),
    [categories],
  );
  const selectedCategory = useMemo(
    () => regularCategories.find((item) => item.id === category) ?? null,
    [regularCategories, category],
  );
  const matchingCategories = useMemo(() => {
    if (!hasSearch) return [];
    return regularCategories.filter((item) => (
      matchesSearchText(item.name, search)
      || matchesSearchText(item.description, search)
    ));
  }, [hasSearch, regularCategories, search]);
  const visibleStores = useMemo(
    () => stores.filter((store) => !isServiceStoreCategory(store.category)),
    [stores],
  );
  const matchingServiceTypes = useMemo(() => {
    const term = normalizeSearch(search);

    if ((resultMode === "services" && !term) || isServiceSearch(term)) {
      return serviceTypes;
    }

    if (!term) {
      return [];
    }

    return serviceTypes
      .filter((serviceType) => (
        matchesSearchText(serviceType.name, term)
        || matchesSearchText(serviceType.description, term)
      ))
      .sort((left, right) => serviceSearchScore(left, term) - serviceSearchScore(right, term));
  }, [resultMode, search, serviceTypes]);
  const showServiceResults = hasSearch || resultMode === "services";
  const showStoreResults = hasSearch || resultMode === "stores";
  const showProductResults = hasSearch || resultMode === "products";
  const storesLoading = locationQuery.isLoading || storesQuery.isLoading;
  const productsLoading = locationQuery.isLoading || productsQuery.isLoading;
  const servicesLoading = locationQuery.isLoading || servicesQuery.isLoading;
  const isDebouncing = search !== marketplaceSearch;
  const isLoading = (showStoreResults && storesLoading)
    || (showProductResults && productsLoading) || (showServiceResults && servicesLoading);
  const error = storesQuery.error || productsQuery.error || servicesQuery.error;
  const hasAnySearchResult = Boolean(
    matchingCategories.length || matchingServiceTypes.length || visibleStores.length || products.length,
  );
  const showGlobalEmptySearch = hasSearch
    && !isLoading
    && !isDebouncing
    && !error
    && !productsQuery.hasMore
    && !hasAnySearchResult;

  useEffect(() => {
    if (focused && !marketplaceLocation && (locationQuery.hasData || locationQuery.error)) {
      setLocationPromptOpen(true);
    }
  }, [focused, locationQuery.error, locationQuery.hasData, marketplaceLocation]);

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
    const timeout = setTimeout(() => setMarketplaceSearch(search), 280);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [category, marketplaceLocation?.city, marketplaceLocation?.state, marketplaceSearch, resultMode]);

  useLiveRefresh({ accessToken: session?.accessToken,
    enabled: Boolean(marketplaceLocation),
    scopeKey: marketplaceLocation ? `${marketplaceLocation.city}|${marketplaceLocation.state}` : "",
    events: [realtimeEvents.serviceAvailabilityUpdated], onRefresh: servicesQuery.refresh });

  useLiveRefresh({
    accessToken: session?.accessToken,
    enabled: canLoad && (showStoreResults || showProductResults),
    scopeKey: marketplaceLocation ? `${marketplaceLocation.city}|${marketplaceLocation.state}|${category}|${marketplaceSearch}` : "",
    intervalMs: 30000,
    refreshOnFocus: false,
    onRefresh: () => Promise.allSettled([
      ...(showStoreResults ? [storesQuery.refresh()] : []),
      // Don't repeatedly download the whole visited feed while the user scrolls.
      ...(showProductResults && (productsQuery.data?.pageCount ?? 1) === 1 ? [productsQuery.refresh()] : []),
    ]),
  });

  const openStore = useCallback((store) => {
    navigation.navigate("StoreConversation", { store, storeId: store.id });
  }, [navigation]);

  const openProduct = useCallback((item) => {
    navigation.navigate("ProductDetails", {
      product: item.product,
      store: item.store,
    });
  }, [navigation]);

  function openStoreSuggestion(suggestion) {
    navigation.navigate("StoreConversation", {
      storeId: suggestion.storeId ?? suggestion.id,
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
    setResultMode((mode) => mode === "products" ? "products" : "stores");
    setSearch("");
  }

  async function confirmMarketplaceLocation(location) {
    if (!session?.accessToken) return;

    const response = await updateCurrentUser(session.accessToken, { location });
    const key = marketplaceLocationKey(session.user.id);
    readCache.set(key, { ...readCache.get(key).data, marketplaceLocation: response.user.marketplaceLocation ?? location });
    setLocationPromptOpen(false);
  }

  const locationLabel = marketplaceLocation
    ? `${marketplaceLocation.city} - ${marketplaceLocation.state}`
    : "sua cidade";
  const resultDescription = search.trim()
    ? `Resultados em ${locationLabel} para "${search.trim()}"`
    : selectedCategory
      ? `${resultMode === "products" ? "Produtos" : "Lojas"} de ${selectedCategory.name} em ${locationLabel}`
      : resultMode === "products"
        ? `Produtos disponiveis em ${locationLabel}`
        : `Lojas disponiveis em ${locationLabel}`;

  const listHeader = (
    <>
      <View style={styles.hero}>
        <BrandLogo centered size="large" />

        {marketplaceLocation ? (
          <Pressable
            accessibilityHint="Abre as opcoes para trocar a cidade"
            accessibilityLabel={`Localizacao atual: ${marketplaceLocation.city}, ${marketplaceLocation.state}`}
            accessibilityRole="button"
            onPress={() => setLocationPromptOpen(true)}
            style={({ pressed }) => [styles.locationBadge, pressed && styles.locationBadgePressed]}
          >
            <Ionicons color={colors.primaryDark} name="location" size={15} />
            <Text style={styles.locationBadgeText}>
              {marketplaceLocation.city} - {marketplaceLocation.state}
            </Text>
            <Ionicons color={colors.primaryDark} name="chevron-down" size={14} />
          </Pressable>
        ) : null}

        <View style={styles.searchArea}>
          <SearchBar
            containerStyle={styles.searchBarFlex}
            loading={suggestionsLoading}
            onChangeText={changeSearch}
            onFocusChange={setSearchFocused}
            onSelectSuggestion={selectSuggestion}
            onSubmit={submitSearch}
            placeholder="Buscar lojas, produtos ou servicos"
            showVoice
            suggestions={suggestions}
            searchInfo={searchInfo}
            searchError={suggestionsError}
            onRetrySuggestions={retrySuggestions}
            value={search}
          />
        </View>
      </View>

      <View style={[styles.body, showProductResults && styles.bodyProducts]}>
        {!hasSearch ? <ResultModeSelector mode={resultMode} onChange={(mode) => {
          setResultMode(mode);
          setCategory("todas");
        }} /> : null}

        {hasSearch ? (
          <View style={styles.globalSearchHint}>
            <Ionicons color={colors.primaryDark} name="search-outline" size={16} />
            <Text style={styles.globalSearchHintText}>Buscando em lojas, produtos e servicos</Text>
          </View>
        ) : null}

        {hasSearch && matchingCategories.length ? (
          <View style={styles.section}>
            <View style={styles.resultsHeader}>
              <View style={styles.resultsCopy}>
                <Text style={styles.sectionTitle}>Categorias</Text>
                <Text style={styles.sectionSubtitle}>Atalhos relacionados a sua busca</Text>
              </View>
              <View style={styles.resultCount}>
                <Text style={styles.resultCountText}>{matchingCategories.length}</Text>
              </View>
            </View>
            <ScrollView
              contentContainerStyle={styles.categoryList}
              horizontal
              removeClippedSubviews={false}
              showsHorizontalScrollIndicator={false}
            >
              {matchingCategories.map((item) => (
                <MarketplaceCategoryCard
                  category={item}
                  key={item.id}
                  label={item.name}
                  onPress={() => selectCategory(item.id)}
                />
              ))}
            </ScrollView>
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
            removeClippedSubviews={false}
            showsHorizontalScrollIndicator={false}
          >
            <MarketplaceCategoryCard
              active={category === "todas"}
              icon="apps-outline"
              label="Todas"
              onPress={() => selectCategory("todas")}
            />
            {regularCategories.map((item) => (
              <MarketplaceCategoryCard
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

          {servicesLoading ? (
            <StatePanel icon="briefcase-outline" loading text="Buscando servicos..." />
          ) : servicesQuery.error && !servicesQuery.hasData ? (
            <StatePanel danger icon="alert-circle-outline" text={servicesQuery.error.message} title="Nao foi possivel buscar" />
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
            {storesLoading || storesQuery.isRefreshing || isDebouncing ? (
              <ActivityIndicator color={colors.primaryDark} size="small" />
            ) : (
              <Text style={styles.resultCountText}>{visibleStores.length}</Text>
            )}
          </View>
        </View>

        {storesLoading ? (
          <StatePanel icon="storefront-outline" loading text="Buscando lojas..." />
        ) : storesQuery.error && !storesQuery.hasData ? (
          <StatePanel danger icon="alert-circle-outline" text={storesQuery.error.message} title="Nao foi possivel buscar" />
        ) : visibleStores.length ? (
          <View style={styles.storeList}>
            {visibleStores.map((store) => (
              <StoreCard fluid key={store.id} store={store} onPress={openStore} />
            ))}
          </View>
        ) : !hasSearch ? (
          <StatePanel
            icon="location-outline"
            text={`Ainda nao encontramos lojas em ${locationLabel}. Toque na cidade acima para mudar a localizacao.`}
            title="Nenhuma loja nesta cidade"
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
              {productsLoading || productsQuery.isRefreshing || isDebouncing ? (
                <ActivityIndicator color={colors.primaryDark} size="small" />
              ) : (
                <Text style={styles.resultCountText}>{products.length}{productsQuery.hasMore ? "+" : ""}</Text>
              )}
            </View>
          </View>

          {productsLoading ? (
            <StatePanel icon="cube-outline" loading text="Buscando produtos..." />
          ) : productsQuery.error && !productsQuery.hasData ? (
            <StatePanel danger icon="alert-circle-outline" text={productsQuery.error.message} title="Nao foi possivel buscar" />
          ) : !products.length && !productsQuery.hasMore && !hasSearch ? (
            <StatePanel
              icon="location-outline"
              text={`Ainda nao encontramos produtos em ${locationLabel}. Toque na cidade acima para mudar a localizacao.`}
              title="Nenhum produto nesta cidade"
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
    </>
  );

  const renderProductRow = useCallback(({ item: row }) => (
    <View style={styles.virtualProductRow}>
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
  ), [openProduct]);

  return (
    <ScreenContainer contentContainerStyle={styles.content} padded={false} scroll={false}>
      <FlatList
        ref={listRef}
        data={showProductResults ? productRows : EMPTY_ITEMS}
        renderItem={renderProductRow}
        keyExtractor={productRowKey}
        ListHeaderComponent={listHeader}
        ListFooterComponent={showProductResults && productsQuery.hasData ? (
          <View style={styles.paginationFooter}>
            {productsQuery.isLoadingMore ? (
              <View style={styles.paginationLoading}>
                <ActivityIndicator color={colors.primaryDark} size="small" />
                <Text style={styles.sectionSubtitle}>Carregando mais produtos...</Text>
              </View>
            ) : productsQuery.loadMoreError ? (
              <>
                <Text style={styles.sectionSubtitle}>Nao foi possivel carregar mais produtos.</Text>
                <Pressable accessibilityRole="button" onPress={productsQuery.retryLoadMore} style={styles.retryPage}>
                  <Text style={styles.retryPageText}>Tentar novamente</Text>
                </Pressable>
              </>
            ) : !productsQuery.hasMore && products.length ? (
              <Text style={styles.sectionSubtitle}>Voce viu todos os produtos desta busca.</Text>
            ) : null}
          </View>
        ) : null}
        onEndReached={showProductResults && !isDebouncing ? productsQuery.loadMore : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={50}
        // Native clipping can detach images in the horizontal category header.
        // FlatList still limits mounted product rows through its render window.
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, showProductResults && styles.listProductContent]}
        style={styles.list}
        refreshing={Boolean(storesQuery.isRefreshing || (productsQuery.isRefreshing && !productsQuery.isLoadingMore))}
        onRefresh={() => {
          void Promise.allSettled([
            ...(showStoreResults ? [storesQuery.refresh()] : []),
            ...(showProductResults ? [productsQuery.refresh()] : []),
            ...(showServiceResults ? [servicesQuery.refresh()] : []),
          ]);
        }}
      />
      <MarketplaceLocationModal
        canDismiss={Boolean(marketplaceLocation)}
        initialLocation={marketplaceLocation}
        onConfirm={confirmMarketplaceLocation}
        onDismiss={() => setLocationPromptOpen(false)}
        visible={locationPromptOpen}
      />
    </ScreenContainer>
  );
}

function productRowKey(row) {
  return `product-row-${row[0]?.store?.id}-${row[0]?.product?.id}`;
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
  return serviceIconName(iconName);
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
  categoryList: { gap: spacing.sm, paddingBottom: spacing.xs, paddingRight: spacing.sm },
  content: { paddingBottom: 0 },
  bodyProducts: { paddingBottom: spacing.md },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1 },
  listProductContent: { paddingBottom: spacing.xxxl },
  virtualProductRow: {
    alignSelf: "center",
    alignItems: "stretch",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    maxWidth: 560,
    paddingHorizontal: spacing.lg,
    width: "100%",
  },
  paginationFooter: { alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  paginationLoading: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  retryPage: { backgroundColor: colors.primarySoft, borderRadius: radius.round, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryPageText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: typography.caption },
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
  locationBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  locationBadgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  locationBadgePressed: { backgroundColor: colors.primaryLight, opacity: 0.82 },
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
  productGridCard: { flex: 1 },
  productGridSpacer: { flex: 1, minWidth: 0 },
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
