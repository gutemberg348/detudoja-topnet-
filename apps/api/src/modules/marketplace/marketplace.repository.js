import { prisma } from "../../config/prisma.js";
import { commercialTier2UserWhere } from "../../utils/commercial-access.js";
import { cityAddressWhere, normalizeLocation, requireUserMarketplaceLocation } from "../../utils/location.js";
import {
  getOrderEarningsDistribution,
  getPaymentPolicy,
} from "../earnings/order-earnings.config.js";
import { availableServiceWhere } from "../service-chats/service-availability.js";
import { localPublicStoreSql, localAvailableServiceSql } from "./marketplace-search.repository.js";
import { productCursorWhere } from "./product-pagination.js";

const publicStoreWhere = {
  excluido_em: null,
  lojista: {
    is: {
      status: "ATIVO",
      status_kyc: "APROVADO",
      usuario: { is: commercialTier2UserWhere },
    },
  },
  status: "ATIVA",
  visivel_no_app: true,
};
const publicSellerStatuses = ["ATIVO", "PENDENTE"];
function normalizedSql(column) {
  return `marketplace_search_normalize(${column})`;
}

function nameSearchRankSql(column) {
  const name = normalizedSql(column);
  return `CASE WHEN ${name} = ANY(ARRAY(SELECT trim(both '%' FROM term) FROM unnest($1::text[]) term)) THEN 0
    WHEN ${name} LIKE ANY(ARRAY(SELECT trim(leading '%' FROM term) FROM unnest($1::text[]) term)) THEN 1
    WHEN ${name} LIKE ANY($1::text[]) THEN 2 ELSE 3 END`;
}

function allSearchTokensSql(columns) {
  const text = normalizedSql(`concat_ws(' ', ${columns.join(", ")})`);
  return `EXISTS (SELECT 1 FROM jsonb_array_elements($2::jsonb) terms
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(terms) word
      WHERE NOT (CASE WHEN word ~ '[0-9]' THEN word = ANY(regexp_split_to_array(${text}, ' '))
        ELSE ${text} LIKE '%' || word || '%' END)))`;
}

function idsFromRows(rows) {
  return rows.map((row) => Number(row.id)).filter(Number.isInteger);
}

export const marketplaceRepository = {
  getBaseAddress(userId) {
    return requireUserMarketplaceLocation(prisma, userId);
  },

  getEarningsDistribution() {
    return getOrderEarningsDistribution(prisma);
  },

  getPaymentPolicy() {
    return getPaymentPolicy(prisma);
  },

  findStore(baseAddress, storeId) {
    return prisma.loja.findFirst({
      include: {
        categoria: { include: { segmento_venda: true } },
        lojista: { select: { usuario_id: true } },
        segmento_venda: true,
        usuarios: { select: { status: true, usuario_id: true } },
        produtos: {
          orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { criado_em: "desc" }],
          where: { excluido_em: null, status: "ATIVO" },
        },
      },
      where: {
        id: storeId,
        ...publicStoreWhere,
        endereco: { is: cityAddressWhere(baseAddress) },
      },
    });
  },

  listCategories(baseAddress) {
    return prisma.categoriaLoja.findMany({
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
  },

  listProducts(baseAddress, { categoryId, productIds, page }) {
    return prisma.produtoLoja.findMany({
      include: {
        loja: {
          include: {
            categoria: { include: { segmento_venda: true } },
            lojista: { select: { usuario_id: true } },
            segmento_venda: true,
            usuarios: { select: { status: true, usuario_id: true } },
          },
        },
      },
      orderBy: [{ destaque: "desc" }, { criado_em: "desc" }, { id: "desc" }],
      take: page ? page.limit + 1 : 50,
      where: {
        excluido_em: null,
        ...(page?.cursor ? { AND: [productCursorWhere(page.cursor)] } : {}),
        ...(productIds ? { id: { in: productIds } } : {}),
        loja: {
          ...publicStoreWhere,
          endereco: { is: cityAddressWhere(baseAddress) },
          ...(categoryId ? { categoria_id: categoryId } : {}),
        },
        status: "ATIVO",
      },
    });
  },

  listStores(where) {
    return prisma.loja.findMany({
      include: {
        _count: {
          select: {
            produtos: { where: { excluido_em: null, status: "ATIVO" } },
          },
        },
        categoria: { include: { segmento_venda: true } },
        lojista: { select: { usuario_id: true } },
        segmento_venda: true,
        usuarios: { select: { status: true, usuario_id: true } },
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
          where: { excluido_em: null, status: "ATIVO" },
        },
      },
      orderBy: [{ criado_em: "desc" }],
      take: 30,
      where,
    });
  },

  async listSuggestions(baseAddress, matches, limit) {
    const [categories, stores, products, serviceTypes] = await Promise.all([
      prisma.categoriaLoja.findMany({
        orderBy: { nome: "asc" },
        take: limit,
        where: {
          excluido_em: null,
          ...(matches ? { id: { in: matches.categoryIds.slice(0, limit) } } : {}),
          lojas: {
            some: {
              ...publicStoreWhere,
              endereco: { is: cityAddressWhere(baseAddress) },
            },
          },
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
          ...(matches ? { id: { in: matches.storeIds.slice(0, limit) } } : {}),
        },
      }),
      prisma.produtoLoja.findMany({
        include: { loja: { include: { categoria: true } } },
        orderBy: [{ destaque: "desc" }, { criado_em: "desc" }],
        take: limit,
        where: {
          excluido_em: null,
          ...(matches ? { id: { in: matches.productIds.slice(0, limit) } } : {}),
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
          ...(matches ? { id: { in: matches.serviceTypeIds.slice(0, limit) } } : {}),
          slug: { not: "entregador" },
          status: "ATIVO",
          servicos_vendedor: {
            some: {
              ...availableServiceWhere(),
              excluido_em: null,
              status: "ATIVO",
              vendedor: {
                excluido_em: null,
                status: { in: publicSellerStatuses },
                status_kyc: "APROVADO",
                usuario: {
                  is: {
                    ...commercialTier2UserWhere,
                    enderecos: {
                      some: cityAddressWhere(baseAddress, { userAddress: true }),
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return { categories, products, serviceTypes, stores };
  },

  async querySearchMatches(patterns, servicePatterns = patterns, tokenGroups = [], address) {
    const city = normalizeLocation(address.cidade ?? address.city);
    const state = String(address.estado ?? address.state).trim().toUpperCase();
    const rawCity = String(address.cidade ?? address.city).trim();
    const localStores = localPublicStoreSql("$3", "$4", "$5");
    const [categories, stores, products, serviceTypes] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT c.id, ${nameSearchRankSql("c.nome")} AS rank FROM categorias_loja c
         WHERE c.excluido_em IS NULL
           AND c.status::text = 'ATIVA'
           AND EXISTS (SELECT 1 FROM lojas l WHERE l.categoria_id = c.id AND ${localStores})
           AND (${normalizedSql("nome")} LIKE ANY($1::text[]) OR ${allSearchTokensSql(["c.nome"])} ) ORDER BY rank, c.id`,
        patterns, JSON.stringify(tokenGroups), city, state, rawCity,
      ),
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT l.id, ${nameSearchRankSql("l.nome")} AS rank
         FROM lojas l
         INNER JOIN categorias_loja c ON c.id = l.categoria_id
         LEFT JOIN segmentos_venda s ON s.id = l.segmento_venda_id
         LEFT JOIN produtos_loja p ON p.loja_id = l.id AND p.excluido_em IS NULL AND p.status::text = 'ATIVO'
         WHERE ${localStores}
           AND (${normalizedSql("l.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("l.descricao")} LIKE ANY($1::text[])
             OR ${normalizedSql("c.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("s.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.resumo_curto")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.descricao")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.marca")} LIKE ANY($1::text[])
             OR ${allSearchTokensSql(["l.nome", "l.descricao", "c.nome", "s.nome", "p.nome", "p.resumo_curto", "p.descricao", "p.marca"])} ) ORDER BY rank, l.id`,
        patterns, JSON.stringify(tokenGroups), city, state, rawCity,
      ),
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT p.id, ${nameSearchRankSql("p.nome")} AS rank
         FROM produtos_loja p
         INNER JOIN lojas l ON l.id = p.loja_id
         INNER JOIN categorias_loja c ON c.id = l.categoria_id
         LEFT JOIN segmentos_venda s ON s.id = l.segmento_venda_id
         WHERE p.excluido_em IS NULL AND p.status::text = 'ATIVO'
           AND ${localStores}
           AND (${normalizedSql("p.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.resumo_curto")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.descricao")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.marca")} LIKE ANY($1::text[])
             OR ${normalizedSql("l.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("c.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("s.nome")} LIKE ANY($1::text[])
             OR ${allSearchTokensSql(["p.nome", "p.resumo_curto", "p.descricao", "p.marca", "l.nome", "c.nome", "s.nome"])} ) ORDER BY rank, p.id`,
        patterns, JSON.stringify(tokenGroups), city, state, rawCity,
      ),
      prisma.$queryRawUnsafe(
        `SELECT t.id, ${nameSearchRankSql("t.nome")} AS rank FROM tipos_servico t
         WHERE ${localAvailableServiceSql("$3", "$4", "$5")}
           AND (${normalizedSql("nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("descricao")} LIKE ANY($1::text[])
             OR ${allSearchTokensSql(["nome", "descricao"])} ) ORDER BY rank, id`,
        servicePatterns, JSON.stringify(servicePatterns.some((pattern) => /mototaxi|moto taxi|motoboy/.test(pattern)) ? [] : tokenGroups), city, state, rawCity,
      ),
    ]);

    return {
      categoryIds: idsFromRows(categories),
      productIds: idsFromRows(products),
      serviceTypeIds: idsFromRows(serviceTypes),
      storeIds: idsFromRows(stores),
    };
  },
};

export { publicStoreWhere };
