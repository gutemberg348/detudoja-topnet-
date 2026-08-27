import { prisma } from "../../config/prisma.js";

const segmentInclude = {
  _count: { select: { lojas: true, vendedores: true, vendas_autonomas: true } },
  categoria_loja: { select: { id: true, nome: true } },
};

export const adminSegmentsRepository = {
  create(data) {
    return prisma.segmentoVenda.create({ data, include: segmentInclude });
  },

  findActiveCategory(categoryId) {
    return prisma.categoriaLoja.findFirst({
      select: { id: true },
      where: { excluido_em: null, id: categoryId, status: "ATIVA" },
    });
  },

  findById(id) {
    return prisma.segmentoVenda.findFirst({
      select: { id: true },
      where: { excluido_em: null, id },
    });
  },

  findNameConflict(name, slug, ignoredId) {
    return prisma.segmentoVenda.findFirst({
      select: { id: true },
      where: {
        OR: [{ nome: { equals: name, mode: "insensitive" } }, { slug }],
        excluido_em: null,
        ...(ignoredId ? { id: { not: ignoredId } } : {}),
      },
    });
  },

  list({ search, status }) {
    return prisma.segmentoVenda.findMany({
      include: segmentInclude,
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: {
        excluido_em: null,
        ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
        ...(["ATIVO", "INATIVO"].includes(status) ? { status } : {}),
      },
    });
  },

  softDelete(id) {
    return prisma.segmentoVenda.update({
      data: { excluido_em: new Date(), status: "INATIVO" },
      where: { id },
    });
  },

  update(id, data) {
    return prisma.segmentoVenda.update({ data, include: segmentInclude, where: { id } });
  },
};
