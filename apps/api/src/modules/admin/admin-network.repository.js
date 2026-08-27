import { prisma } from "../../config/prisma.js";

const visibleIndicationStatuses = ["ATIVA", "CONVERTIDA", "PENDENTE"];
const qualificationInclude = {
  indicacoes_feitas: {
    include: { indicado: { include: { kyc: true } } },
    where: { status: { in: visibleIndicationStatuses } },
  },
  kyc: true,
};

export const adminNetworkRepository = {
  findCompanyRoot(email) {
    return prisma.usuario.findUnique({
      include: qualificationInclude,
      where: { email },
    });
  },

  findMatrixChildren(parentIds) {
    return prisma.indicacao.findMany({
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
    return prisma.usuario.findMany({
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
    return prisma.usuario.findUnique({
      include: qualificationInclude,
      where: { id },
    });
  },

  findUnallocatedIndications() {
    return prisma.indicacao.findMany({
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
