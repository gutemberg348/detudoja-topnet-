import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { cityAddressWhere, requireUserBaseAddress } from "../../utils/location.js";
import {
  getOrderEarningsDistribution,
  getSegmentCommissionDistribution,
} from "../earnings/order-earnings.config.js";
import { defaultDeliveryFeeCents } from "../orders/orders.config.js";

const publicStoreWhere = {
  excluido_em: null,
  status: "ATIVA",
  visivel_no_app: true,
};

const serviceCategoryNames = new Set(["servicos"]);
const publicSellerStatuses = ["ATIVO", "PENDENTE"];

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

const plainCharacters = "aaaaaaeeeeiiiiooooouuuucnyy";
const normalizedAccentCharacters = String.fromCharCode(
  0x00e1, 0x00e0, 0x00e2, 0x00e3, 0x00e4, 0x00e5,
  0x00e9, 0x00e8, 0x00ea, 0x00eb,
  0x00ed, 0x00ec, 0x00ee, 0x00ef,
  0x00f3, 0x00f2, 0x00f4, 0x00f5, 0x00f6,
  0x00fa, 0x00f9, 0x00fb, 0x00fc,
  0x00e7, 0x00f1, 0x00fd, 0x00ff,
);

function normalizedSql(column) {
  return `regexp_replace(translate(lower(coalesce(${column}, '')), '${normalizedAccentCharacters}', '${plainCharacters}'), '[^a-z0-9]+', ' ', 'g')`;
}

function idsFromRows(rows) {
  return rows.map((row) => Number(row.id)).filter(Number.isInteger);
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
  const [categories, stores, products, serviceTypes] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT id FROM categorias_loja
       WHERE excluido_em IS NULL
         AND status::text = 'ATIVA'
         AND ${normalizedSql("nome")} LIKE ANY($1::text[])`,
      patterns,
    ),
    prisma.$queryRawUnsafe(
      `SELECT DISTINCT l.id
       FROM lojas l
       INNER JOIN categorias_loja c ON c.id = l.categoria_id
       LEFT JOIN segmentos_venda s ON s.id = l.segmento_venda_id
       LEFT JOIN produtos_loja p
         ON p.loja_id = l.id
         AND p.excluido_em IS NULL
         AND p.status::text = 'ATIVO'
       WHERE l.excluido_em IS NULL
         AND l.status::text = 'ATIVA'
         AND l.visivel_no_app = true
         AND (
           ${normalizedSql("l.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("l.descricao")} LIKE ANY($1::text[])
           OR ${normalizedSql("c.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("s.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.resumo_curto")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.descricao")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.marca")} LIKE ANY($1::text[])
         )`,
      patterns,
    ),
    prisma.$queryRawUnsafe(
      `SELECT DISTINCT p.id
       FROM produtos_loja p
       INNER JOIN lojas l ON l.id = p.loja_id
       INNER JOIN categorias_loja c ON c.id = l.categoria_id
       LEFT JOIN segmentos_venda s ON s.id = l.segmento_venda_id
       WHERE p.excluido_em IS NULL
         AND p.status::text = 'ATIVO'
         AND l.excluido_em IS NULL
         AND l.status::text = 'ATIVA'
         AND l.visivel_no_app = true
         AND (
           ${normalizedSql("p.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.resumo_curto")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.descricao")} LIKE ANY($1::text[])
           OR ${normalizedSql("p.marca")} LIKE ANY($1::text[])
           OR ${normalizedSql("l.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("c.nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("s.nome")} LIKE ANY($1::text[])
         )`,
      patterns,
    ),
    prisma.$queryRawUnsafe(
      `SELECT id FROM tipos_servico
       WHERE excluido_em IS NULL
         AND status::text = 'ATIVO'
         AND modo_atendimento::text = 'NEGOCIACAO_CHAT'
         AND slug <> 'entregador'
         AND (
           ${normalizedSql("nome")} LIKE ANY($1::text[])
           OR ${normalizedSql("descricao")} LIKE ANY($1::text[])
         )`,
      patterns,
    ),
  ]);

  return {
    categoryIds: idsFromRows(categories),
    productIds: idsFromRows(products),
    serviceTypeIds: idsFromRows(serviceTypes),
    storeIds: idsFromRows(stores),
  };
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

function parsePositiveIntId(value, label = "ID invalido") {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(label, 400);
  }

  return id;
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

function serializeStore(store, { globalDistribution, includeProducts = false } = {}) {
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
  const customFeePercent = store.taxa_plataforma_personalizada_percentual;
  const feePercentOverride = customFeePercent != null
    ? Number(customFeePercent)
    : segment
      ? null
      : Number(store.categoria?.taxa_plataforma_percentual ?? 0);
  const commission = getSegmentCommissionDistribution(segment, globalDistribution, {
    feePercentOverride,
  });

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
      feeCents: deliveryAvailable ? defaultDeliveryFeeCents : null,
      pickupAvailable,
    },
    description: store.descricao,
    email: store.email,
    id: store.id,
    logoUrl: store.logo_url,
    minimumProductPriceCents,
    name: store.nome,
    openForOrders: store.aberta_para_pedidos,
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
      : parsePositiveIntId(query.categoryId, "Categoria invalida");

  const matches = search ? await findMarketplaceSearchMatches(search) : null;

  return {
    ...publicStoreWhere,
    endereco: { is: cityAddressWhere(baseAddress) },
    ...(categoryId ? { categoria_id: categoryId } : {}),
    ...(matches ? { id: { in: matches.storeIds } } : {}),
  };
}

export async function listMarketplaceCategories(userId) {
  const baseAddress = await requireUserBaseAddress(prisma, userId);
  const categories = await prisma.categoriaLoja.findMany({
    include: {
      _count: {
        select: {
          lojas: {
            where: {
              ...publicStoreWhere,
              endereco: { is: cityAddressWhere(baseAddress) },
            },
          },
        },
      },
    },
    orderBy: { nome: "asc" },
    where: { excluido_em: null, status: "ATIVA" },
  });

  return {
    categories: categories
      .filter((category) => !isServiceStoreCategory(category))
      .map(serializeCategory),
  };
}

export async function listMarketplaceStores(userId, query = {}) {
  const baseAddress = await requireUserBaseAddress(prisma, userId);
  const where = await marketplaceQuery(query, baseAddress);
  const [stores, globalDistribution] = await Promise.all([
    prisma.loja.findMany({
      include: {
        _count: {
          select: {
            produtos: {
              where: {
                excluido_em: null,
                status: "ATIVO",
              },
            },
          },
        },
        categoria: { include: { segmento_venda: true } },
        segmento_venda: true,
        produtos: {
          orderBy: { preco_centavos: "asc" },
          select: {
            aceita_entrega: true,
            aceita_retirada: true,
            prazo_estimado_minutos: true,
            preco_centavos: true,
            preco_promocional_centavos: true,
          },
          take: 20,
          where: {
            excluido_em: null,
            status: "ATIVO",
          },
        },
      },
      orderBy: [{ criado_em: "desc" }],
      take: 30,
      where,
    }),
    getOrderEarningsDistribution(prisma),
  ]);

  return {
    stores: stores
      .filter((store) => !isServiceStoreCategory(store.categoria))
      .map((store) => serializeStore(store, { globalDistribution })),
  };
}

export async function listMarketplaceProducts(userId, query = {}) {
  const baseAddress = await requireUserBaseAddress(prisma, userId);
  const search = String(query.search ?? "").trim();
  const categoryId =
    query.categoryId === undefined || query.categoryId === null || query.categoryId === ""
      ? null
      : parsePositiveIntId(query.categoryId, "Categoria invalida");
  const matches = search ? await findMarketplaceSearchMatches(search) : null;

  const [products, globalDistribution] = await Promise.all([
    prisma.produtoLoja.findMany({
      include: {
        loja: {
          include: {
            categoria: { include: { segmento_venda: true } },
            segmento_venda: true,
          },
        },
      },
      orderBy: [{ destaque: "desc" }, { criado_em: "desc" }],
      take: 50,
      where: {
        excluido_em: null,
        ...(matches ? { id: { in: matches.productIds } } : {}),
        loja: {
          ...publicStoreWhere,
          endereco: { is: cityAddressWhere(baseAddress) },
          ...(categoryId ? { categoria_id: categoryId } : {}),
        },
        status: "ATIVO",
      },
    }),
    getOrderEarningsDistribution(prisma),
  ]);

  return {
    products: products
      .filter((product) => !isServiceStoreCategory(product.loja.categoria))
      .map((product) => ({
        product: serializeProduct(product),
        store: serializeStore(product.loja, { globalDistribution }),
      })),
  };
}

export async function listMarketplaceSuggestions(userId, query = {}) {
  const baseAddress = await requireUserBaseAddress(prisma, userId);
  const search = String(query.search ?? "").trim();
  const limit = Math.min(Number(query.limit ?? 6) || 6, 20);

  if (!search) {
    return { suggestions: [] };
  }

  const matches = await findMarketplaceSearchMatches(search);

  const [categories, stores, products, serviceTypes] = await Promise.all([
    prisma.categoriaLoja.findMany({
      orderBy: { nome: "asc" },
      take: limit,
      where: {
        excluido_em: null,
        id: { in: matches.categoryIds },
        status: "ATIVA",
      },
    }),
    prisma.loja.findMany({
      include: { categoria: true },
      orderBy: [{ criado_em: "desc" }],
      take: limit,
      where: {
        ...publicStoreWhere,
        endereco: { is: cityAddressWhere(baseAddress) },
        id: { in: matches.storeIds },
      },
    }),
    prisma.produtoLoja.findMany({
      include: {
        loja: {
          include: { categoria: true },
        },
      },
      orderBy: [{ destaque: "desc" }, { criado_em: "desc" }],
      take: limit,
      where: {
        excluido_em: null,
        id: { in: matches.productIds },
        loja: {
          ...publicStoreWhere,
          endereco: { is: cityAddressWhere(baseAddress) },
        },
        status: "ATIVO",
      },
    }),
    prisma.tipoServico.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      take: limit,
      where: {
        excluido_em: null,
        id: { in: matches.serviceTypeIds },
        modo_atendimento: "NEGOCIACAO_CHAT",
        slug: { not: "entregador" },
        status: "ATIVO",
        servicos_vendedor: {
          some: {
            disponivel_agora: true,
            excluido_em: null,
            status: "ATIVO",
            vendedor: {
              excluido_em: null,
              status: { in: publicSellerStatuses },
              usuario: { enderecos: { some: cityAddressWhere(baseAddress, { userAddress: true }) } },
            },
          },
        },
      },
    }),
  ]);

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
    label: serviceType.nome,
    type: "service",
  }));
  const suggestions = [
    ...serviceSuggestions,
    ...categorySuggestions,
    ...storeSuggestions,
    ...productSuggestions,
  ]
    .slice(0, limit)
    .map(serializeSuggestion);

  return { suggestions };
}

export async function getMarketplaceStore(userId, storeId) {
  const parsedStoreId = parsePositiveIntId(storeId, "Loja invalida");
  const baseAddress = await requireUserBaseAddress(prisma, userId);
  const [store, globalDistribution] = await Promise.all([
    prisma.loja.findFirst({
      include: {
        categoria: { include: { segmento_venda: true } },
        segmento_venda: true,
        produtos: {
          orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { criado_em: "desc" }],
          where: {
            excluido_em: null,
            status: "ATIVO",
          },
        },
      },
      where: {
        id: parsedStoreId,
        ...publicStoreWhere,
        endereco: { is: cityAddressWhere(baseAddress) },
      },
    }),
    getOrderEarningsDistribution(prisma),
  ]);

  if (!store) {
    throw new AppError("Loja nao encontrada ou indisponivel", 404);
  }

  return { store: serializeStore(store, { globalDistribution, includeProducts: true }) };
}
