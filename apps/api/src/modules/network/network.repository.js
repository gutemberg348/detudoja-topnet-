import { prisma } from "../../config/prisma.js";
import {
  networkQualificationInclude,
  qualifyingIndicationStatuses,
} from "./network.qualification.js";

export const networkRepository = {
  createInviteCode(userId) {
    return prisma.codigoConvite.create({
      data: {
        codigo: `DTJ-${String(userId).padStart(6, "0")}`,
        usuario_id: userId,
      },
    });
  },

  findActiveInviteCode(userId) {
    return prisma.codigoConvite.findFirst({
      orderBy: { criado_em: "desc" },
      where: { ativo: true, usuario_id: userId },
    });
  },

  findCurrentUser(userId) {
    return prisma.usuario.findUnique({
      include: networkQualificationInclude,
      where: { id: userId },
    });
  },

  findLegacyIndications(rootUserId) {
    return prisma.indicacao.findMany({
      include: {
        indicado: { include: networkQualificationInclude },
        indicador: { select: { id: true, nome: true } },
      },
      orderBy: [{ criado_em: "asc" }],
      where: {
        alocado_sob_usuario_id: null,
        indicador_usuario_id: rootUserId,
        status: { in: qualifyingIndicationStatuses },
      },
    });
  },

  findMatrixChildren(parentIds) {
    return prisma.indicacao.findMany({
      include: {
        indicado: { include: networkQualificationInclude },
        indicador: { select: { id: true, nome: true } },
      },
      orderBy: [{ posicao_matriz: "asc" }, { criado_em: "asc" }],
      where: {
        alocado_sob_usuario_id: { in: parentIds },
        status: { in: qualifyingIndicationStatuses },
      },
    });
  },

  findReceivedSponsor(userId) {
    return prisma.indicacao.findUnique({
      select: { indicador_usuario_id: true },
      where: { indicado_usuario_id: userId },
    });
  },

  findRewards(userId) {
    return prisma.recompensa.findMany({
      orderBy: { criado_em: "desc" },
      take: 20,
      where: {
        tipo_recompensa: {
          in: [
            "BONUS_INDICACAO_CONSUMIDOR",
            "BONUS_INDICACAO_LOJISTA",
            "BONUS_VENDEDOR",
          ],
        },
        usuario_beneficiado_id: userId,
      },
    });
  },
};
