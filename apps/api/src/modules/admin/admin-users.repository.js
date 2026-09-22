import { prisma } from "../../config/prisma.js";
import { userSearchConditions } from "./admin-users.search.js";

const userInclude = {
  auditorias_administrativas: {
    include: { administrador: { select: { nome: true } } },
    orderBy: { criado_em: "desc" },
    take: 12,
  },
  carteiras: { include: { tipo_carteira: true } },
  contas_bancarias: {
    orderBy: [{ principal: "desc" }, { atualizado_em: "desc" }],
    take: 1,
    where: { excluido_em: null },
  },
  kyc: {
    include: {
      solicitacoes: {
        orderBy: { enviado_em: "desc" },
        take: 1,
      },
    },
  },
  lojista: true,
  vendedor: {
    include: {
      motoboy: true,
      servicos: {
        include: { tipo_servico: { select: { id: true, nome: true, tipo_operacao: true } } },
        orderBy: { criado_em: "asc" },
        where: { excluido_em: null },
      },
    },
  },
};

const participantWhere = {
  excluido_em: null,
  tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
};

export const adminUsersRepository = {
  createAudit(database, data) {
    return database.auditoriaAdministrativa.create({ data });
  },
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

  async list({ page, perPage, where, search = "" }) {
    if (search) {
      const exact = { OR: userSearchConditions(search, "equals") };
      const prefix = { OR: userSearchConditions(search, "startsWith") };
      // Rank before pagination, without loading the entire participant base.
      const groups = [
        { AND: [where, exact] },
        { AND: [where, prefix, { NOT: exact }] },
        { AND: [where, { NOT: prefix }] },
      ];
      return prisma.$transaction(async (database) => {
        let skip = (page - 1) * perPage;
        const result = [];
        for (const group of groups) {
          if (result.length === perPage) break;
          if (skip > 0) {
            const count = await database.usuario.count({ where: group });
            if (skip >= count) { skip -= count; continue; }
          }
          result.push(...await database.usuario.findMany({
            include: userInclude,
            orderBy: [{ nome: "asc" }, { id: "asc" }],
            skip,
            take: perPage - result.length,
            where: group,
          }));
          skip = 0;
        }
        return result;
      }, { isolationLevel: "RepeatableRead" });
    }
    return prisma.usuario.findMany({
      include: userInclude,
      orderBy: [{ criado_em: "desc" }, { id: "desc" }],
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
