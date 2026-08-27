import { prisma } from "../../config/prisma.js";

const participantWhere = {
  excluido_em: null,
  tipo_conta: { notIn: ["ADMIN", "SUPORTE"] },
};

const recentUserInclude = {
  carteiras: true,
  kyc: true,
  lojista: true,
  vendedor: true,
};

export const adminDashboardRepository = {
  async getSnapshot() {
    const [
      totalParticipants,
      activeParticipants,
      pendingParticipants,
      blockedParticipants,
      approvedKyc,
      pendingKyc,
      totalCategories,
      activeCategories,
      recentParticipants,
    ] = await Promise.all([
      prisma.usuario.count({ where: participantWhere }),
      prisma.usuario.count({ where: { ...participantWhere, status: "ATIVO" } }),
      prisma.usuario.count({ where: { ...participantWhere, status: "PENDENTE" } }),
      prisma.usuario.count({ where: { ...participantWhere, status: "BLOQUEADO" } }),
      prisma.kycUsuario.count({
        where: { status: "APROVADO", usuario: participantWhere },
      }),
      prisma.kycUsuario.count({
        where: {
          status: { in: ["PENDENTE", "EM_ANALISE"] },
          usuario: participantWhere,
        },
      }),
      prisma.categoriaLoja.count({ where: { excluido_em: null } }),
      prisma.categoriaLoja.count({ where: { excluido_em: null, status: "ATIVA" } }),
      prisma.usuario.findMany({
        include: recentUserInclude,
        orderBy: { criado_em: "desc" },
        take: 6,
        where: participantWhere,
      }),
    ]);

    return {
      activeCategories,
      activeParticipants,
      approvedKyc,
      blockedParticipants,
      pendingKyc,
      pendingParticipants,
      recentParticipants,
      totalCategories,
      totalParticipants,
    };
  },
};
