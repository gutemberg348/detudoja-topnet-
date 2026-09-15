import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { cityAddressWhere } from "../../utils/location.js";
import {
  getSegmentCommissionDistribution,
  resolvePaymentPolicy,
} from "../earnings/order-earnings.config.js";
import {
  createCacheKey,
  getOrSetJsonCache,
} from "../cache/cache.service.js";
import {
  marketplaceRepository,
  publicStoreWhere,
} from "./marketplace.repository.js";

const serviceCategoryNames = new Set(["servicos"]);

function normalizeName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function findMarketplaceSearchMatches(search) {
  const normalizedSearch = normalizeName(search);

  if (!normalizedSearch) {
    return {
      categoryIds: [],
      productIds: [],
      serviceTypeIds: [],
      storeIds: [],
    };
  }

  const primaryPatterns = buildSearchPatterns(normalizedSearch);
  const primaryMatches = await queryMarketplaceSearchMatches(primaryPatterns);

  if (hasMarketplaceMatches(primaryMatches) || !normalizedSearch.includes(" ")) {
    return primaryMatches;
  }

  return queryMarketplaceSearchMatches(
    buildSearchPatterns(normalizedSearch, { includeWords: true }),
  );
}

async function queryMarketplaceSearchMatches(patterns) {
  return getOrSetJsonCache({
    key: createCacheKey("marketplace-search-matches", patterns),
    load: () => marketplaceRepository.querySearchMatches(patterns),
    ttlSeconds: 90,
  });
}

function buildSearchPatterns(search, { includeWords = false } = {}) {
  const words = normalizeName(search).split(" ").filter(Boolean);
  const terms = new Set([
    words.join(" "),
    words.map(singularizeSearchWord).join(" "),
  ]);

  if (includeWords && words.length > 1) {
    words
      .filter((word) => word.length >= 3 && !searchStopWords.has(word))
      .forEach((word) => {
        terms.add(word);
        terms.add(singularizeSearchWord(word));
      });
  }

  return [...terms]
    .filter((term) => term.length >= 2)
    .map((term) => `%${term}%`);
}

function hasMarketplaceMatches(matches) {
  return Object.values(matches).some((ids) => ids.length > 0);
}

const searchStopWords = new Set([
  "a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "na",
  "nas", "no", "nos", "o", "os", "para", "por", "loja", "lojas",
  "produto", "produtos", "servico", "servicos",
]);

function singularizeSearchWord(word) {
  if (word.length <= 3 || !word.endsWith("s")) {
    return word;
  }

  if (word.endsWith("oes") || word.endsWith("aes")) {
    return `${word.slice(0, -3)}ao`;
  }

  if (word.endsWith("ais")) {
    return `${word.slice(0, -3)}al`;
  }

  if (word.endsWith("eis")) {
    return `${word.slice(0, -3)}el`;
  }

  if (word.endsWith("is")) {
    return `${word.slice(0, -2)}il`;
  }

  return word.slice(0, -1);
}

function isServiceStoreCategory(category) {
  return serviceCategoryNames.has(normalizeName(category?.nome));
}

function cents(value) {
  return Number(value ?? 0);
}

function serializeCategory(category) {
  return {
    description: category.descricao,
    iconUrl: category.icone_url,
    id: category.id,
    name: category.nome,
    status: category.status,
    storesCount: category._count?.lojas ?? 0,
  };
}

function serializeProduct(product) {
  return {
    acceptDelivery: product.aceita_entrega,
    acceptPickup: product.aceita_retirada,
    brand: product.marca,
    createdAt: product.criado_em.toISOString(),
    description: product.descricao,
    details: product.detalhes_json,
    estimatedTimeMinutes: product.prazo_estimado_minutos,
    featured: product.destaque,
    id: product.id,
    imageUrl: product.imagem_url,
    name: product.nome,
    priceCents: cents(product.preco_centavos),
    promotionalPriceCents: product.preco_promocional_centavos
      ? cents(product.preco_promocional_centavos)
      : null,
    sku: product.sku,
    status: product.status,
    stockControlled: product.estoque_controlado,
    stockQuantity: product.estoque_quantidade,
    shortDescription: product.resumo_curto,
    unit: product.unidade_medida,
    updatedAt: product.atualizado_em.toISOString(),
  };
}

function serializeStore(
  store,
  { globalDistribution, includeProducts = false, paymentPolicy, viewerId = null } = {},
) {
  const products = store.produtos ?? [];
  const deliveryAvailable = products.some((product) => product.aceita_entrega);
  const pickupAvailable = products.some((product) => product.aceita_retirada);
  const minimumProductPriceCents = products.reduce((minimum, product) => {
    const price = cents(product.preco_promocional_centavos ?? product.preco_centavos);
    return minimum === null || price < minimum ? price : minimum;
  }, null);
  const estimatedDeliveryMinutes = products.reduce((minimum, product) => {
    if (!product.aceita_entrega || !product.prazo_estimado_minutos) {
      return minimum;
    }

    const duration = Number(product.prazo_estimado_minutos);
    return minimum === null || duration < minimum ? duration : minimum;
  }, null);
  const segment = store.segmento_venda ?? store.categoria?.segmento_venda ?? null;
  const effectivePaymentPolicy = resolvePaymentPolicy({
    globalPolicy: paymentPolicy,
    segment,
    store,
  });
  const customFeePercent = store.taxa_plataforma_personalizada_percentual;
  const feePercentOverride = customFeePercent != null
    ? Number(customFeePercent)
    : segment
      ? null
      : Number(store.categoria?.taxa_plataforma_percentual ?? 0);
  const commission = getSegmentCommissionDistribution(segment, globalDistribution, {
    feePercentOverride,
  });
  const isManagedByViewer = Boolean(
    viewerId
    && (
      store.lojista?.usuario_id === viewerId
      || store.usuarios?.some(
        (member) => member.usuario_id === viewerId && member.status === "ATIVO",
      )
    ),
  );

  return {
    acceptsOnlinePayment: store.aceita_pagamento_online,
    acceptsQrCode: store.aceita_qrcode,
    bannerUrl: store.banner_url,
    cashbackPercent: Number(commission.cashbackPercent ?? 0),
    category: store.categoria ? serializeCategory(store.categoria) : null,
    createdAt: store.criado_em.toISOString(),
    delivery: {
      available: deliveryAvailable,
      estimatedMinutes: estimatedDeliveryMinutes,
      feeCents: deliveryAvailable
        ? cents(store.taxa_entrega_centavos)
        : null,
      pickupAvailable,
    },
    description: store.descricao,
    email: store.email,
    id: store.id,
    isManagedByViewer,
    logoUrl: store.logo_url,
    minimumProductPriceCents,
    name: store.nome,
    openForOrders: store.aberta_para_pedidos,
    onlineServiceFeeCents: effectivePaymentPolicy.onlineServiceFeeCents,
    orderFlow: (store.segmento_venda
      ? store.segmento_venda.negocia_pedido_por_chat
      : store.categoria?.negocia_pedido_por_chat)
      ? "CHAT_NEGOTIATION"
      : "DIRECT_CHECKOUT",
    openingHours: store.horarios_funcionamento,
    phone: store.telefone,
    products: includeProducts ? products.map(serializeProduct) : undefined,
    productsCount: store._count?.produtos ?? products.length,
    segment: segment
      ? {
          categoryId: segment.categoria_loja_id ?? store.categoria_id,
          id: segment.id,
          name: segment.nome,
          slug: segment.slug,
        }
      : null,
    slug: store.slug,
    status: store.status,
    visibleInApp: store.visivel_no_app,
    whatsapp: store.whatsapp,
  };
}

function serializeSuggestion(suggestion) {
  return {
    categoryId: suggestion.categoryId ?? null,
    description: suggestion.description ?? null,
    iconUrl: suggestion.iconUrl ?? null,
    id: suggestion.id,
    imageUrl: suggestion.imageUrl ?? null,
    iconName: suggestion.iconName ?? null,
    label: suggestion.label,
    storeId: suggestion.storeId ?? null,
    type: suggestion.type,
  };
}

async function marketplaceQuery(query = {}, baseAddress) {
  const search = String(query.search ?? "").trim();
  const categoryId =
    query.categoryId === undefined || query.categoryId === null || query.categoryId === ""
      ? null
      : parsePositiveId(query.categoryId, "Categoria invalida");

  const matches = search ? await findMarketplaceSearchMatches(search) : null;

  return {
    ...publicStoreWhere,
    endereco: { is: cityAddressWhere(baseAddress) },
    ...(categoryId ? { categoria_id: categoryId } : {}),
    ...(matches ? { id: { in: matches.storeIds } } : {}),
  };
}

export async function listMarketplaceCategories(userId) {
  const baseAddress = await marketplaceRepository.getBaseAddress(userId);
  const categories = await marketplaceRepository.listCategories(baseAddress);

  return {
    categories: categories
      .filter((category) => !isServiceStoreCategory(category))
      .map(serializeCategory),
  };
}

export async function listMarketplaceStores(userId, query = {}) {
  const baseAddress = await marketplaceRepository.getBaseAddress(userId);
  const where = await marketplaceQuery(query, baseAddress);
  const [stores, globalDistribution, paymentPolicy] = await Promise.all([
    marketplaceRepository.listStores(where),
    marketplaceRepository.getEarningsDistribution(),
    marketplaceRepository.getPaymentPolicy(),
  ]);

  return {
    stores: stores
      .filter((store) => !isServiceStoreCategory(store.categoria))
      .map((store) => serializeStore(store, { globalDistribution, paymentPolicy, viewerId: userId })),
  };
}

export async function listMarketplaceProducts(userId, query = {}) {
  const baseAddress = await marketplaceRepository.getBaseAddress(userId);
  const search = String(query.search ?? "").trim();
  const categoryId =
    query.categoryId === undefined || query.categoryId === null || query.categoryId === ""
      ? null
      : parsePositiveId(query.categoryId, "Categoria invalida");
  const matches = search ? await findMarketplaceSearchMatches(search) : null;

  const [products, globalDistribution, paymentPolicy] = await Promise.all([
    marketplaceRepository.listProducts(baseAddress, {
      categoryId,
      productIds: matches?.productIds,
    }),
    marketplaceRepository.getEarningsDistribution(),
    marketplaceRepository.getPaymentPolicy(),
  ]);

  return {
    products: products
      .filter((product) => !isServiceStoreCategory(product.loja.categoria))
      .map((product) => ({
        product: serializeProduct(product),
        store: serializeStore(product.loja, { globalDistribution, paymentPolicy, viewerId: userId }),
      })),
  };
}

export async function listMarketplaceSuggestions(userId, query = {}) {
  const baseAddress = await marketplaceRepository.getBaseAddress(userId);
  const search = String(query.search ?? "").trim();
  const limit = Math.min(Number(query.limit ?? 6) || 6, 20);

  const normalizedSearch = normalizeName(search);
  if (normalizedSearch.length === 1) return { suggestions: [] };
  const matches = normalizedSearch
    ? await findMarketplaceSearchMatches(normalizedSearch)
    : null;

  const { categories, stores, products, serviceTypes } =
    await marketplaceRepository.listSuggestions(baseAddress, matches, limit);

  const categorySuggestions = categories
    .filter((category) => !isServiceStoreCategory(category))
    .slice(0, 3)
    .map((category) => ({
      description: "Categoria",
      iconUrl: category.icone_url,
      id: category.id,
      label: category.nome,
      type: "category",
    }));
  const storeSuggestions = stores
    .filter((store) => !isServiceStoreCategory(store.categoria))
    .slice(0, 3)
    .map((store) => ({
      categoryId: store.categoria_id,
      description: store.categoria?.nome ?? "Loja",
      iconUrl: store.logo_url,
      id: store.id,
      imageUrl: store.banner_url,
      label: store.nome,
      storeId: store.id,
      type: "store",
    }));
  const productSuggestions = products
    .filter((product) => !isServiceStoreCategory(product.loja?.categoria))
    .map((product) => ({
      categoryId: product.loja.categoria_id,
      description: `${product.loja.nome} - ${product.loja.categoria?.nome ?? "Produto"}`,
      iconUrl: product.imagem_url,
      id: product.id,
      imageUrl: product.imagem_url,
      label: product.nome,
      storeId: product.loja_id,
      type: "product",
    }));
  const serviceSuggestions = serviceTypes.map((serviceType) => ({
    description: "Disponivel agora",
    id: serviceType.id,
    iconName: serviceType.icone,
    label: serviceType.nome,
    type: "service",
  }));
  const groups = [storeSuggestions, productSuggestions, categorySuggestions, serviceSuggestions]
    .map((group) => rankSuggestions(group, normalizedSearch));
  const suggestions = interleaveSuggestions(groups, limit)
    .map(serializeSuggestion);

  return { suggestions };
}

function rankSuggestions(suggestions, search) {
  if (!search) return suggestions;

  return [...suggestions].sort((left, right) => (
    suggestionScore(left, search) - suggestionScore(right, search)
    || String(left.label).localeCompare(String(right.label), "pt-BR")
  ));
}

function suggestionScore(suggestion, search) {
  const label = normalizeName(suggestion.label);
  const description = normalizeName(suggestion.description);
  if (label === search) return 0;
  if (label.startsWith(search)) return 1;
  if (label.includes(search)) return 2;
  if (description.startsWith(search)) return 3;
  if (description.includes(search)) return 4;
  return 5;
}

function interleaveSuggestions(groups, limit) {
  const result = [];
  const queues = groups.map((group) => [...group]);

  while (result.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (queue.length && result.length < limit) result.push(queue.shift());
    }
  }

  return result;
}

export async function getMarketplaceStore(userId, storeId) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const baseAddress = await marketplaceRepository.getBaseAddress(userId);
  const [store, globalDistribution, paymentPolicy] = await Promise.all([
    marketplaceRepository.findStore(baseAddress, parsedStoreId),
    marketplaceRepository.getEarningsDistribution(),
    marketplaceRepository.getPaymentPolicy(),
  ]);

  if (!store) {
    throw new AppError("Loja nao encontrada ou indisponivel", 404);
  }

  return {
    store: serializeStore(store, {
      globalDistribution,
      includeProducts: true,
      paymentPolicy,
      viewerId: userId,
    }),
  };
}
