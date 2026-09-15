import { prisma } from "../../config/prisma.js";
import { commercialTier2UserWhere } from "../../utils/commercial-access.js";
import { cityAddressWhere, requireUserMarketplaceLocation } from "../../utils/location.js";
import {
  getOrderEarningsDistribution,
  getPaymentPolicy,
} from "../earnings/order-earnings.config.js";
import { availableServiceWhere } from "../service-chats/service-availability.js";

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

  listProducts(baseAddress, { categoryId, productIds }) {
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
      orderBy: [{ destaque: "desc" }, { criado_em: "desc" }],
      take: 50,
      where: {
        excluido_em: null,
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
          ...(matches ? { id: { in: matches.categoryIds } } : {}),
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
          ...(matches ? { id: { in: matches.storeIds } } : {}),
        },
      }),
      prisma.produtoLoja.findMany({
        include: { loja: { include: { categoria: true } } },
        orderBy: [{ destaque: "desc" }, { criado_em: "desc" }],
        take: limit,
        where: {
          excluido_em: null,
          ...(matches ? { id: { in: matches.productIds } } : {}),
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
          ...(matches ? { id: { in: matches.serviceTypeIds } } : {}),
          modo_atendimento: "NEGOCIACAO_CHAT",
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

  async querySearchMatches(patterns) {
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
         LEFT JOIN produtos_loja p ON p.loja_id = l.id AND p.excluido_em IS NULL AND p.status::text = 'ATIVO'
         WHERE l.excluido_em IS NULL AND l.status::text = 'ATIVA' AND l.visivel_no_app = true
           AND (${normalizedSql("l.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("l.descricao")} LIKE ANY($1::text[])
             OR ${normalizedSql("c.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("s.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.resumo_curto")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.descricao")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.marca")} LIKE ANY($1::text[]))`,
        patterns,
      ),
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT p.id
         FROM produtos_loja p
         INNER JOIN lojas l ON l.id = p.loja_id
         INNER JOIN categorias_loja c ON c.id = l.categoria_id
         LEFT JOIN segmentos_venda s ON s.id = l.segmento_venda_id
         WHERE p.excluido_em IS NULL AND p.status::text = 'ATIVO'
           AND l.excluido_em IS NULL AND l.status::text = 'ATIVA' AND l.visivel_no_app = true
           AND (${normalizedSql("p.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.resumo_curto")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.descricao")} LIKE ANY($1::text[])
             OR ${normalizedSql("p.marca")} LIKE ANY($1::text[])
             OR ${normalizedSql("l.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("c.nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("s.nome")} LIKE ANY($1::text[]))`,
        patterns,
      ),
      prisma.$queryRawUnsafe(
        `SELECT id FROM tipos_servico
         WHERE excluido_em IS NULL AND status::text = 'ATIVO'
           AND modo_atendimento::text = 'NEGOCIACAO_CHAT' AND slug <> 'entregador'
           AND (${normalizedSql("nome")} LIKE ANY($1::text[])
             OR ${normalizedSql("descricao")} LIKE ANY($1::text[]))`,
        patterns,
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
