import { prisma } from "../../config/prisma.js";

const serviceTypeInclude = {
  segmento_venda: { select: { id: true, nome: true } },
  _count: { select: { servicos_vendedor: true } },
};

export const adminServiceTypesRepository = {
  create(data) {
    return prisma.tipoServico.create({ data, include: serviceTypeInclude });
  },

  findActiveSegment(id) {
    return prisma.segmentoVenda.findFirst({
      select: { id: true },
      where: { excluido_em: null, id, status: "ATIVO" },
    });
  },

  findById(id) {
    return prisma.tipoServico.findFirst({
      select: { id: true },
      where: { excluido_em: null, id },
    });
  },

  findNameConflict(name, slug, ignoredId) {
    return prisma.tipoServico.findFirst({
      select: { id: true },
      where: {
        OR: [{ nome: { equals: name, mode: "insensitive" } }, { slug }],
        excluido_em: null,
        ...(ignoredId ? { id: { not: ignoredId } } : {}),
      },
    });
  },

  list({ search, status }) {
    return prisma.tipoServico.findMany({
      include: serviceTypeInclude,
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      where: {
        excluido_em: null,
        ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
        ...(["ATIVO", "INATIVO", "PAUSADO"].includes(status) ? { status } : {}),
      },
    });
  },

  softDelete(id) {
    return prisma.tipoServico.update({
      data: { excluido_em: new Date(), status: "INATIVO" },
      where: { id },
    });
  },

  update(id, data) {
    return prisma.tipoServico.update({ data, include: serviceTypeInclude, where: { id } });
  },
};
