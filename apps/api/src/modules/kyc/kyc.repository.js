import { prisma } from "../../config/prisma.js";

const submissionInclude = {
  analisado_por_admin: { select: { id: true, nome: true } },
  arquivos: { orderBy: { id: "asc" } },
  kyc_usuario: {
    include: {
      usuario: {
        select: { cpf: true, email: true, id: true, nome: true, telefone: true },
      },
    },
  },
};

export function createKycRepository(database = prisma) {
  return {
    activateIndication(userId) {
      return database.indicacao.updateMany({
        data: { status: "ATIVA" },
        where: { indicado_usuario_id: userId, status: "PENDENTE" },
      });
    },

    createSubmission(kycId, documentType, triage, files) {
      return database.solicitacaoKyc.create({
        data: {
          arquivos: {
            create: files.map((file) => ({
              altura: file.height,
              brilho_medio: file.brightness,
              caminho_privado: file.relativePath,
              contraste_medio: file.contrast,
              largura: file.width,
              mime_type: file.mimeType,
              sha256: file.hash,
              tamanho_bytes: file.size,
              tipo: file.kind,
            })),
          },
          kyc_usuario_id: kycId,
          status: "EM_ANALISE",
          tipo_documento: documentType,
          triagem_json: triage,
        },
        include: submissionInclude,
      });
    },

    countSubmissions(where) {
      return database.solicitacaoKyc.count({ where });
    },

    findFile(submissionId, fileId) {
      return database.arquivoKyc.findFirst({
        where: { id: fileId, solicitacao_id: submissionId },
      });
    },

    findHashMatches(hashes) {
      return database.arquivoKyc.findMany({
        select: {
          sha256: true,
          solicitacao: { select: { kyc_usuario: { select: { usuario_id: true } } } },
        },
        where: { sha256: { in: hashes } },
      });
    },

    findSubmission(id) {
      return database.solicitacaoKyc.findUnique({
        include: submissionInclude,
        where: { id },
      });
    },

    findNextAutomaticSubmission() {
      return database.solicitacaoKyc.findFirst({
        include: submissionInclude,
        orderBy: { enviado_em: "asc" },
        where: {
          status: "EM_ANALISE",
          triagem_json: { equals: "PENDENTE", path: ["processingStatus"] },
        },
      });
    },

    findInterruptedAutomaticSubmissions(before) {
      return database.solicitacaoKyc.findMany({
        orderBy: { atualizado_em: "asc" },
        take: 10,
        where: {
          atualizado_em: { lt: before },
          status: "EM_ANALISE",
          triagem_json: { equals: "PROCESSANDO", path: ["processingStatus"] },
        },
      });
    },

    findUser(userId) {
      return database.usuario.findUnique({
        include: {
          kyc: {
            include: {
              solicitacoes: {
                include: { arquivos: { orderBy: { id: "asc" } } },
                orderBy: { enviado_em: "desc" },
                take: 1,
              },
            },
          },
        },
        where: { id: userId },
      });
    },

    listSubmissions({ page, perPage, where }) {
      return database.solicitacaoKyc.findMany({
        include: submissionInclude,
        orderBy: { enviado_em: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
        where,
      });
    },

    async lockUserForKycSubmission(userId) {
      await database.$queryRaw`SELECT "id" FROM "usuarios" WHERE "id" = ${userId} FOR UPDATE`;
    },

    claimAutomaticSubmission(submissionId, triage) {
      return database.solicitacaoKyc.updateMany({
        data: { triagem_json: triage },
        where: {
          id: submissionId,
          status: "EM_ANALISE",
          triagem_json: { equals: "PENDENTE", path: ["processingStatus"] },
        },
      });
    },

    updateSubmissionTriage(submissionId, triage) {
      return database.solicitacaoKyc.updateMany({
        data: { triagem_json: triage },
        where: { id: submissionId, status: "EM_ANALISE" },
      });
    },

    async markKycApproved({ adminId, reason, submissionId, userId }) {
      const now = new Date();
      const decision = await database.solicitacaoKyc.updateMany({
          data: { analisado_em: now, analisado_por_admin_id: adminId, motivo_decisao: reason, status: "APROVADO" },
          where: { id: submissionId, status: "EM_ANALISE" },
        });
      if (decision.count === 0) return false;
      await Promise.all([
        database.kycUsuario.update({
          data: { motivo_reprovacao: null, status: "APROVADO", validado_em: now },
          where: { usuario_id: userId },
        }),
        database.usuario.update({ data: { nivel_kyc: "TIER_2" }, where: { id: userId } }),
        database.lojista.updateMany({
          data: { status: "ATIVO", status_kyc: "APROVADO" },
          where: { tipo_pessoa: "FISICA", usuario_id: userId },
        }),
        database.vendedor.updateMany({
          data: { status: "ATIVO", status_kyc: "APROVADO" },
          where: { tipo_pessoa: "FISICA", usuario_id: userId },
        }),
      ]);
      return true;
    },

    async markKycRejected({ adminId, reason, submissionId, userId }) {
      const now = new Date();
      const decision = await database.solicitacaoKyc.updateMany({
          data: { analisado_em: now, analisado_por_admin_id: adminId, motivo_decisao: reason, status: "REPROVADO" },
          where: { id: submissionId, status: "EM_ANALISE" },
        });
      if (decision.count === 0) return false;
      await Promise.all([
        database.kycUsuario.update({
          data: { motivo_reprovacao: reason, status: "REPROVADO", validado_em: null },
          where: { usuario_id: userId },
        }),
        database.usuario.update({ data: { nivel_kyc: "REPROVADO" }, where: { id: userId } }),
        database.lojista.updateMany({ data: { status_kyc: "REPROVADO" }, where: { usuario_id: userId } }),
        database.vendedor.updateMany({ data: { status_kyc: "REPROVADO" }, where: { usuario_id: userId } }),
      ]);
      return true;
    },

    async markKycRevoked({ adminId, reason, submissionId, userId }) {
      const now = new Date();
      const decision = await database.solicitacaoKyc.updateMany({
        data: {
          analisado_em: now,
          analisado_por_admin_id: adminId,
          motivo_decisao: reason,
          status: "BLOQUEADO",
        },
        where: { id: submissionId, status: "APROVADO" },
      });
      if (decision.count === 0) return false;

      await Promise.all([
        database.kycUsuario.update({
          data: { motivo_reprovacao: reason, status: "BLOQUEADO", validado_em: null },
          where: { usuario_id: userId },
        }),
        database.usuario.update({
          data: { nivel_kyc: "BLOQUEADO", status: "BLOQUEADO" },
          where: { id: userId },
        }),
        database.lojista.updateMany({
          data: { status: "BLOQUEADO", status_kyc: "BLOQUEADO" },
          where: { usuario_id: userId },
        }),
        database.loja.updateMany({
          data: { aberta_para_pedidos: false, status: "BLOQUEADA", visivel_no_app: false },
          where: { lojista: { usuario_id: userId } },
        }),
        database.vendedor.updateMany({
          data: { atende_agora: false, status: "BLOQUEADO", status_kyc: "BLOQUEADO" },
          where: { usuario_id: userId },
        }),
        database.servicoVendedor.updateMany({
          data: { disponivel_agora: false, status: "PAUSADO" },
          where: { vendedor: { usuario_id: userId } },
        }),
        database.motoboy.updateMany({
          data: { aceita_chamadas_plataforma: false, status: "BLOQUEADO" },
          where: { vendedor: { usuario_id: userId } },
        }),
        database.sessaoAutenticacao.updateMany({
          data: { revogada_em: now },
          where: { revogada_em: null, usuario_id: userId },
        }),
        database.auditoriaAdministrativa.create({
          data: {
            acao: "KYC_REVOGADO",
            administrador_id: adminId,
            dados_json: { motivo: reason, solicitacaoKycId: submissionId },
            usuario_alvo_id: userId,
          },
        }),
      ]);
      return true;
    },

    setKycUnderReview(user) {
      return database.kycUsuario.upsert({
        create: { cpf: user.cpf, nome_completo: user.nome, status: "EM_ANALISE", tipo_pessoa: "FISICA", usuario_id: user.id },
        update: { cpf: user.cpf, motivo_reprovacao: null, nome_completo: user.nome, status: "EM_ANALISE", validado_em: null },
        where: { usuario_id: user.id },
      });
    },

    transaction(work) {
      return database.$transaction(async (transaction) => work(createKycRepository(transaction)));
    },
  };
}

export const kycRepository = createKycRepository();
