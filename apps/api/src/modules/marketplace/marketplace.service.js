import { normalizeSearchText, searchTextScore } from "shared/search";
import { findMarketplaceSearchMatches } from "./marketplace-search.service.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { cityAddressWhere } from "../../utils/location.js";
import {
  getSegmentCommissionDistribution,
  resolvePaymentPolicy,
} from "../earnings/order-earnings.config.js";
import {
  marketplaceRepository,
  publicStoreWhere,
} from "./marketplace.repository.js";
import { encodeProductCursor, productPageOptions } from "./product-pagination.js";

export { buildServiceSearchPatterns } from "./marketplace-search.service.js";

const serviceCategoryNames = new Set(["servicos"]);

const normalizeName = normalizeSearchText;

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

  const matches = search ? await findMarketplaceSearchMatches(search, baseAddress) : null;

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
  const page = productPageOptions(query);
  const baseAddress = await marketplaceRepository.getBaseAddress(userId);
  const search = String(query.search ?? "").trim();
  const categoryId =
    query.categoryId === undefined || query.categoryId === null || query.categoryId === ""
      ? null
      : parsePositiveId(query.categoryId, "Categoria invalida");
  const matches = search ? await findMarketplaceSearchMatches(search, baseAddress) : null;

  const [products, globalDistribution, paymentPolicy] = await Promise.all([
    marketplaceRepository.listProducts(baseAddress, {
      categoryId,
      productIds: matches?.productIds,
      page,
    }),
    marketplaceRepository.getEarningsDistribution(),
    marketplaceRepository.getPaymentPolicy(),
  ]);

  const pageProducts = page ? products.slice(0, page.limit) : products;
  const hasMore = Boolean(page && products.length > page.limit);
  return {
    ...(page ? { pagination: {
      limit: page.limit,
      hasMore,
      nextCursor: hasMore ? encodeProductCursor(pageProducts.at(-1)) : null,
    } } : {}),
    products: pageProducts
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
  const matches = normalizedSearch.length >= 2
    ? await findMarketplaceSearchMatches(normalizedSearch, baseAddress)
    : null;

  let candidates = visibleSuggestionCandidates(await marketplaceRepository.listSuggestions(baseAddress, matches, Math.min(limit * 3, 60)));
  const hasResults = Object.values(candidates).some((items) => items.length);
  const discovery = Boolean(normalizedSearch && (!matches || !hasResults));
  if (!hasResults && matches) candidates = visibleSuggestionCandidates(await marketplaceRepository.listSuggestions(baseAddress, null, limit));
  const { categories, stores, products, serviceTypes } = candidates;

  const categorySuggestions = categories
    .filter((category) => !isServiceStoreCategory(category))
    .map((category) => ({
      description: "Categoria",
      iconUrl: category.icone_url,
      id: category.id,
      label: category.nome,
      type: "category",
    }));
  const storeSuggestions = stores
    .filter((store) => !isServiceStoreCategory(store.categoria))
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
  const transportSearch = /\b(?:moto taxi|mototaxi|taxi|taxista|motoboy|moto boy)\b/.test(normalizedSearch);
  const groups = (transportSearch
    ? [serviceSuggestions, storeSuggestions, productSuggestions, categorySuggestions]
    : [storeSuggestions, productSuggestions, categorySuggestions, serviceSuggestions])
    .map((group) => rankSuggestions(group, normalizedSearch));
  const combined = interleaveSuggestions(groups, limit * 4);
  const suggestions = (normalizedSearch && !discovery ? rankSuggestions(combined, normalizedSearch) : combined)
    .slice(0, limit).map(serializeSuggestion);
  return { suggestions, searchInfo: {
    ...(matches?.searchInfo ?? { query: normalizedSearch, suggestedTerms: [] }),
    discovery,
  } };
}

function visibleSuggestionCandidates({ categories, stores, products, serviceTypes }) {
  return {
    categories: categories.filter((category) => !isServiceStoreCategory(category)),
    stores: stores.filter((store) => !isServiceStoreCategory(store.categoria)),
    products: products.filter((product) => !isServiceStoreCategory(product.loja?.categoria)),
    serviceTypes,
  };
}

function rankSuggestions(suggestions, search) {
  if (!search) return suggestions;

  return [...suggestions].sort((left, right) => (
    suggestionScore(left, search) - suggestionScore(right, search)
    || String(left.label).localeCompare(String(right.label), "pt-BR")
  ));
}

function suggestionScore(suggestion, search) {
  return 1 - Math.max(searchTextScore(suggestion.label, search),
    searchTextScore(suggestion.description, search) * 0.8);
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
