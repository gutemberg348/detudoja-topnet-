import { prisma } from "../../config/prisma.js";

const categoryInclude = {
  _count: { select: { lojas: true, segmentos_venda: true } },
};

export const adminCategoriesRepository = {
  create(data) {
    return prisma.categoriaLoja.create({ data, include: categoryInclude });
  },

  findActiveById(id) {
    return prisma.categoriaLoja.findFirst({
      select: { icone_url: true, id: true },
      where: { excluido_em: null, id },
    });
  },

  findNameConflict(name, ignoredId) {
    return prisma.categoriaLoja.findFirst({
      select: { id: true },
      where: {
        excluido_em: null,
        nome: { equals: name, mode: "insensitive" },
        ...(ignoredId ? { id: { not: ignoredId } } : {}),
      },
    });
  },

  list({ search, status }) {
    return prisma.categoriaLoja.findMany({
      include: categoryInclude,
      orderBy: { nome: "asc" },
      where: {
        excluido_em: null,
        ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
        ...(["ATIVA", "INATIVA"].includes(status) ? { status } : {}),
      },
    });
  },

  softDelete(id) {
    return prisma.categoriaLoja.update({
      data: { excluido_em: new Date(), status: "INATIVA" },
      where: { id },
    });
  },

  update(id, data) {
    return prisma.categoriaLoja.update({
      data,
      include: categoryInclude,
      where: { id },
    });
  },
};
