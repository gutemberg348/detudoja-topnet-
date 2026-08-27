import { prisma } from "../../config/prisma.js";

export function createKycRepository(database = prisma) {
  return {
    activateIndication(userId) {
      return database.indicacao.updateMany({
        data: { status: "ATIVA" },
        where: { indicado_usuario_id: userId },
      });
    },

    approveMerchant(userId) {
      return database.lojista.updateMany({
        data: { status_kyc: "APROVADO" },
        where: { usuario_id: userId },
      });
    },

    approveSeller(userId) {
      return database.vendedor.updateMany({
        data: { status_kyc: "APROVADO" },
        where: { usuario_id: userId },
      });
    },

    approveUserKyc(user) {
      const now = new Date();
      return database.kycUsuario.upsert({
        create: {
          cpf: user.cpf,
          nome_completo: user.nome,
          status: "APROVADO",
          tipo_pessoa: "FISICA",
          usuario_id: user.id,
          validado_em: now,
        },
        update: {
          cpf: user.cpf,
          nome_completo: user.nome,
          motivo_reprovacao: null,
          status: "APROVADO",
          validado_em: now,
        },
        where: { usuario_id: user.id },
      });
    },

    findUser(userId) {
      return database.usuario.findUnique({
        include: { kyc: true },
        where: { id: userId },
      });
    },

    promoteUserKyc(userId) {
      return database.usuario.update({
        data: { nivel_kyc: "TIER_2" },
        where: { id: userId },
      });
    },

    transaction(work) {
      return database.$transaction(async (transaction) =>
        work(createKycRepository(transaction)),
      );
    },
  };
}

export const kycRepository = createKycRepository();
