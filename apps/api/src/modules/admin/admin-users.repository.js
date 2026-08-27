import { prisma } from "../../config/prisma.js";

const userInclude = {
  carteiras: { include: { tipo_carteira: true } },
  kyc: true,
  lojista: true,
  vendedor: true,
};

const participantWhere = {
  excluido_em: null,
  tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
};

export const adminUsersRepository = {
  count(where) {
    return prisma.usuario.count({ where });
  },

  findParticipant(id) {
    return prisma.usuario.findFirst({
      include: userInclude,
      where: { ...participantWhere, id },
    });
  },

  findParticipantId(id) {
    return prisma.usuario.findFirst({
      select: { id: true },
      where: { ...participantWhere, id },
    });
  },

  list({ page, perPage, where }) {
    return prisma.usuario.findMany({
      include: userInclude,
      orderBy: { criado_em: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      where,
    });
  },

  transaction(work) {
    return prisma.$transaction(work);
  },

  update(id, data) {
    return prisma.usuario.update({ data, where: { id } });
  },
};
