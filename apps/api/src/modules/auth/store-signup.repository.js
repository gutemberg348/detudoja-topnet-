import { prisma } from "../../config/prisma.js";

const sourceSelect = {
  id: true,
  logo_url: true,
  lojista: {
    select: {
      usuario_id: true,
      usuario: {
        select: {
          excluido_em: true,
          status: true,
        },
      },
    },
  },
  nome: true,
  slug: true,
};

export function createStoreSignupRepository(database = prisma) {
  return {
    findAccessibleStore(userId, storeId) {
      return database.loja.findFirst({
        select: {
          id: true,
          logo_url: true,
          nome: true,
          slug: true,
        },
        where: {
          excluido_em: null,
          id: storeId,
          status: "ATIVA",
          lojista: { usuario_id: userId },
        },
      });
    },

    findSourceById(storeId) {
      return database.loja.findFirst({
        select: sourceSelect,
        where: {
          excluido_em: null,
          id: storeId,
          status: "ATIVA",
        },
      });
    },

    findSourceBySlug(storeSlug) {
      return database.loja.findFirst({
        select: sourceSelect,
        where: {
          excluido_em: null,
          slug: storeSlug,
          status: "ATIVA",
        },
      });
    },
  };
}

export const storeSignupRepository = createStoreSignupRepository();
