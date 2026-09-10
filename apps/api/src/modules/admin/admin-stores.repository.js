import { prisma } from "../../config/prisma.js";
import { getPaymentPolicy } from "../earnings/order-earnings.config.js";

const storeInclude = {
  _count: {
    select: {
      pedidos: true,
      produtos: { where: { excluido_em: null } },
    },
  },
  categoria: { include: { segmento_venda: true } },
  segmento_venda: true,
  lojista: {
    include: {
      usuario: {
        select: {
          email: true,
          id: true,
          nome: true,
          status: true,
          telefone: true,
        },
      },
    },
  },
};

export function createAdminStoresRepository(database = prisma) {
  return {
    count(where) {
      return database.loja.count({ where });
    },

    findCategory(id) {
      return database.categoriaLoja.findFirst({
        select: { id: true },
        where: { excluido_em: null, id },
      });
    },

    getPaymentPolicy() {
      return getPaymentPolicy(database);
    },

    findCurrentStore(id) {
      return database.loja.findFirst({
        include: { lojista: true },
        where: { excluido_em: null, id },
      });
    },

    findSegment(id) {
      return database.segmentoVenda.findFirst({
        include: {
          categoria_loja: true,
          categorias_loja: { where: { excluido_em: null, status: "ATIVA" } },
        },
        where: { excluido_em: null, id, status: "ATIVO" },
      });
    },

    findStore(id) {
      return database.loja.findFirst({
        include: storeInclude,
        where: { excluido_em: null, id },
      });
    },

    findStoreId(id) {
      return database.loja.findFirst({
        select: { id: true },
        where: { excluido_em: null, id },
      });
    },

    findUserContactConflict({ email, phone, userId }) {
      return database.usuario.findFirst({
        select: { id: true },
        where: {
          id: { not: userId },
          ...(email ? { email } : { telefone: phone }),
        },
      });
    },

    list({ page, perPage, where }) {
      return database.loja.findMany({
        include: storeInclude,
        orderBy: { criado_em: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        where,
      });
    },

    softDelete(id) {
      return database.loja.update({
        data: {
          excluido_em: new Date(),
          status: "PAUSADA",
          visivel_no_app: false,
        },
        where: { id },
      });
    },

    transaction(work) {
      return database.$transaction(async (transaction) =>
        work(createAdminStoresRepository(transaction)),
      );
    },

    updateMerchant(id, data) {
      return database.lojista.update({ data, where: { id } });
    },

    updateOwner(id, data) {
      return database.usuario.update({ data, where: { id } });
    },

    updateStore(id, data) {
      return database.loja.update({ data, include: storeInclude, where: { id } });
    },
  };
}

export const adminStoresRepository = createAdminStoresRepository();
