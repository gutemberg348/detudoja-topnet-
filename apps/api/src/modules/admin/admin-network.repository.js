import { prisma } from "../../config/prisma.js";

const visibleIndicationStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];
const qualificationInclude = {
  indicacoes_feitas: {
    include: { indicado: { include: { kyc: true } } },
    where: { status: { in: visibleIndicationStatuses } },
  },
  kyc: true,
};

export function createAdminNetworkRepository(database = prisma) {
  return {
  lockMatrix() {
    return database.$executeRawUnsafe("SELECT pg_advisory_xact_lock(84217001)");
  },

  listPlacements() {
    return database.indicacao.findMany({
      select: {
        alocado_sob_usuario_id: true,
        id: true,
        indicado_usuario_id: true,
        nivel_matriz: true,
        posicao_matriz: true,
      },
    });
  },

  updatePlacement(id, data) {
    return database.indicacao.update({ data, where: { id } });
  },

  findPlacementByUser(userId) {
    return database.indicacao.findUnique({
      include: {
        alocado_sob: { select: { email: true, id: true, nome: true } },
        indicado: { select: { email: true, id: true, nome: true } },
        indicador: { select: { email: true, id: true, nome: true } },
      },
      where: { indicado_usuario_id: userId },
    });
  },

  findPlacementUser(id) {
    return database.usuario.findFirst({
      select: { email: true, id: true, nome: true, status: true },
      where: {
        excluido_em: null,
        id,
        tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
      },
    });
  },

  transaction(work) {
    return prisma.$transaction(work);
  },

  findCompanyRoot(email) {
    return database.usuario.findUnique({
      include: qualificationInclude,
      where: { email },
    });
  },

  findMatrixChildren(parentIds) {
    return database.indicacao.findMany({
      include: {
        alocado_sob: { select: { email: true, id: true, nome: true } },
        indicado: { include: qualificationInclude },
        indicador: { select: { email: true, id: true, nome: true } },
      },
      orderBy: [{ posicao_matriz: "asc" }, { criado_em: "asc" }],
      where: {
        alocado_sob_usuario_id: { in: parentIds },
        status: { in: visibleIndicationStatuses },
      },
    });
  },

  findOrphanUsers(rootUserId) {
    return database.usuario.findMany({
      orderBy: { criado_em: "asc" },
      select: {
        criado_em: true,
        email: true,
        id: true,
        nome: true,
        status: true,
        tipo_conta: true,
      },
      where: {
        excluido_em: null,
        id: { not: rootUserId },
        indicacao_recebida: null,
        tipo_conta: { not: "ADMIN" },
      },
    });
  },

  findRootById(id) {
    return database.usuario.findUnique({
      include: qualificationInclude,
      where: { id },
    });
  },

  findUnallocatedIndications() {
    return database.indicacao.findMany({
      include: {
        indicado: { select: { email: true, id: true, nome: true } },
        indicador: { select: { email: true, id: true, nome: true } },
      },
      orderBy: { criado_em: "asc" },
      take: 50,
      where: {
        alocado_sob_usuario_id: null,
        status: { in: visibleIndicationStatuses },
      },
    });
  },
  };
}

export const adminNetworkRepository = createAdminNetworkRepository();
