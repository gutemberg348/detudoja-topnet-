import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { env } from "../../config/env.js";
import { logError } from "../../config/logger.js";
import { getCurrentUser } from "../users/users.service.js";
import {
  prepareKycImage,
  readPrivateKycFile,
  removeKycDirectory,
  savePreparedKycImages,
} from "./kyc-image.service.js";
import { analyzeKycSubmission } from "./kyc-recognition.service.js";
import { kycRepository } from "./kyc.repository.js";

const fileLabels = {
  DOCUMENTO_FRENTE: "Frente do documento",
  DOCUMENTO_VERSO: "Verso do documento",
  SELFIE: "Selfie",
};

function serializeSubmission(submission, { admin = false } = {}) {
  if (!submission) return null;

  const base = {
    analyzedAt: submission.analisado_em?.toISOString() ?? null,
    automaticReview: admin
      ? submission.triagem_json
      : { result: submission.triagem_json?.automaticResult ?? null },
    decisionReason: submission.motivo_decisao,
    documentType: submission.tipo_documento,
    id: submission.id,
    status: submission.status,
    submittedAt: submission.enviado_em.toISOString(),
  };

  if (!admin) return base;

  return {
    ...base,
    analyzedBy: submission.analisado_por_admin
      ? { id: submission.analisado_por_admin.id, name: submission.analisado_por_admin.nome }
      : null,
    files: submission.arquivos.map((file) => ({
      brightness: Number(file.brilho_medio),
      contrast: Number(file.contraste_medio),
      height: file.altura,
      id: file.id,
      label: fileLabels[file.tipo],
      mimeType: file.mime_type,
      sizeBytes: file.tamanho_bytes,
      type: file.tipo,
      url: `/api/admin/kyc/submissions/${submission.id}/files/${file.id}`,
      width: file.largura,
    })),
    user: {
      cpf: submission.kyc_usuario.usuario.cpf,
      email: submission.kyc_usuario.usuario.email,
      id: submission.kyc_usuario.usuario.id,
      name: submission.kyc_usuario.usuario.nome,
      phone: submission.kyc_usuario.usuario.telefone,
    },
  };
}

function assertKycCanBeSubmitted(user) {
  if (!user.cpf) throw new AppError("Informe o CPF antes de enviar os documentos", 428);
  if (user.kyc?.status === "APROVADO") throw new AppError("Seu KYC ja esta aprovado", 409);
  if (user.kyc?.status === "EM_ANALISE") throw new AppError("Seu KYC ja esta em analise", 409);
  if (user.kyc?.status === "BLOQUEADO") {
    throw new AppError("Seu KYC foi bloqueado. Entre em contato com o suporte", 403);
  }
}

function requiredFiles(files, documentType) {
  const front = files?.documentFront?.[0];
  const back = files?.documentBack?.[0];
  const selfie = files?.selfie?.[0];

  if (!front || !selfie || (["RG", "RNE"].includes(documentType) && !back)) {
    throw new AppError(
      documentType === "CNH"
        ? "Envie a foto da CNH e uma selfie"
        : "Envie frente, verso do documento e uma selfie",
      400,
    );
  }

  return [
    { file: front, kind: "DOCUMENTO_FRENTE" },
    ...(back ? [{ file: back, kind: "DOCUMENTO_VERSO" }] : []),
    { file: selfie, kind: "SELFIE" },
  ];
}

function automaticDecision(triage) {
  if (triage.automaticResult === "APROVADO") return "APROVADO";
  if (triage.automaticResult === "REPROVADO") return "REPROVADO";
  return "EM_ANALISE";
}

export async function getCurrentKyc(userId) {
  const user = await kycRepository.findUser(userId);
  if (!user) throw new AppError("Usuario nao encontrado", 404);

  return {
    kyc: {
      rejectionReason: user.kyc?.motivo_reprovacao ?? null,
      status: user.kyc?.status ?? "PENDENTE",
      submission: serializeSubmission(user.kyc?.solicitacoes?.[0]),
    },
  };
}

export async function submitCurrentUserKyc(userId, { documentType, files }) {
  const user = await kycRepository.findUser(userId);
  if (!user) throw new AppError("Usuario nao encontrado", 404);
  assertKycCanBeSubmitted(user);
  const latestSubmissionId = user.kyc?.solicitacoes?.[0]?.id ?? null;

  const prepared = await Promise.all(
    requiredFiles(files, documentType).map(({ file, kind }) => prepareKycImage(file, kind)),
  );
  if (new Set(prepared.map((file) => file.hash)).size !== prepared.length) {
    throw new AppError("Use fotos diferentes para documento e selfie", 400);
  }

  const previousFiles = await kycRepository.findHashMatches(prepared.map((file) => file.hash));
  const reusedByAnotherUser = previousFiles.some(
    (file) => file.solicitacao.kyc_usuario.usuario_id !== user.id,
  );
  let triage;

  if (env.kyc.mode === "automatic") {
    try {
      triage = await analyzeKycSubmission({
        cpf: user.cpf,
        documentType,
        images: prepared,
        name: user.nome,
        reusedByAnotherUser,
      });
    } catch (error) {
      logError("kyc.automatic_analysis_failed", error, { userId: user.id });
      throw new AppError("Nao foi possivel analisar as fotos agora. Tente novamente em instantes.", 503);
    }
  } else {
    const warnings = prepared.flatMap((file) => [
      ...file.warnings.map((warning) => ({ file: file.kind, warning })),
      ...(reusedByAnotherUser ? [{ file: file.kind, warning: "IMAGEM_REUTILIZADA" }] : []),
    ]);
    triage = {
      automaticResult: warnings.length ? "REVISAR_COM_ATENCAO" : "APTO_PARA_ANALISE",
      checksPerformed: ["FORMATO_REAL", "DIMENSOES", "ILUMINACAO", "CONTRASTE", "ARQUIVOS_REPETIDOS"],
      manualChecksRequired: ["AUTENTICIDADE_DOCUMENTO", "DADOS_DO_TITULAR", "ROSTO_DA_SELFIE"],
      version: 1,
      warnings,
    };
  }

  const stored = await savePreparedKycImages(prepared);
  try {
    await kycRepository.transaction(async (repository) => {
      await repository.lockUserForKycSubmission(user.id);
      const currentUser = await repository.findUser(user.id);
      if (!currentUser) throw new AppError("Usuario nao encontrado", 404);
      assertKycCanBeSubmitted(currentUser);
      if ((currentUser.kyc?.solicitacoes?.[0]?.id ?? null) !== latestSubmissionId) {
        throw new AppError("Ja existe um envio KYC mais recente", 409);
      }
      const kyc = await repository.setKycUnderReview(currentUser);
      const submission = await repository.createSubmission(kyc.id, documentType, triage, stored.files);
      if (env.kyc.mode === "automatic") {
        const outcome = automaticDecision(triage);
        const decision = {
          adminId: null,
          reason: triage.decisionReason,
          submissionId: submission.id,
          userId: user.id,
        };
        if (outcome === "APROVADO") {
          await repository.markKycApproved(decision);
          await repository.activateIndication(user.id);
        } else if (outcome === "REPROVADO") {
          await repository.markKycRejected(decision);
        }
      }
    });
  } catch (error) {
    await removeKycDirectory(stored.directory);
    if (error?.code === "P2002") throw new AppError("Seu KYC ja esta em analise", 409);
    throw error;
  }

  return { ...(await getCurrentKyc(userId)), ...(await getCurrentUser(userId)) };
}

function buildAdminWhere(query) {
  const search = query.search?.trim();
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          kyc_usuario: {
            usuario: {
              OR: [
                { nome: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { cpf: { contains: search.replace(/\D/g, "") } },
              ],
            },
          },
        }
      : {}),
  };
}

export async function listAdminKycSubmissions(query) {
  const where = buildAdminWhere(query);
  const [total, submissions] = await Promise.all([
    kycRepository.countSubmissions(where),
    kycRepository.listSubmissions({ ...query, where }),
  ]);
  return {
    pagination: {
      page: query.page,
      pages: Math.max(1, Math.ceil(total / query.perPage)),
      perPage: query.perPage,
      total,
    },
    submissions: submissions.map((item) => serializeSubmission(item, { admin: true })),
  };
}

export async function getAdminKycSubmission(value) {
  const id = parsePositiveId(value, "Solicitacao KYC invalida");
  const submission = await kycRepository.findSubmission(id);
  if (!submission) throw new AppError("Solicitacao KYC nao encontrada", 404);
  return { submission: serializeSubmission(submission, { admin: true }) };
}

export async function getAdminKycFile(submissionValue, fileValue) {
  const submissionId = parsePositiveId(submissionValue, "Solicitacao KYC invalida");
  const fileId = parsePositiveId(fileValue, "Arquivo KYC invalido");
  const file = await kycRepository.findFile(submissionId, fileId);
  if (!file) throw new AppError("Arquivo KYC nao encontrado", 404);
  return { buffer: await readPrivateKycFile(file.caminho_privado), mimeType: file.mime_type };
}

async function decideSubmission(adminId, submissionValue, reason, status) {
  const submissionId = parsePositiveId(submissionValue, "Solicitacao KYC invalida");
  await kycRepository.transaction(async (repository) => {
    const submission = await repository.findSubmission(submissionId);
    if (!submission) throw new AppError("Solicitacao KYC nao encontrada", 404);
    if (submission.status !== "EM_ANALISE") throw new AppError("Esta solicitacao ja foi analisada", 409);
    const data = { adminId, reason, submissionId, userId: submission.kyc_usuario.usuario.id };
    if (status === "APROVADO") {
      const decided = await repository.markKycApproved(data);
      if (!decided) throw new AppError("Esta solicitacao ja foi analisada", 409);
      await repository.activateIndication(data.userId);
    } else {
      const decided = await repository.markKycRejected(data);
      if (!decided) throw new AppError("Esta solicitacao ja foi analisada", 409);
    }
  });
  return getAdminKycSubmission(submissionId);
}

export function approveKycSubmission(adminId, submissionId, reason) {
  return decideSubmission(adminId, submissionId, reason, "APROVADO");
}

export function rejectKycSubmission(adminId, submissionId, reason) {
  return decideSubmission(adminId, submissionId, reason, "REPROVADO");
}

export async function revokeKycSubmission(adminId, submissionValue, reason) {
  const submissionId = parsePositiveId(submissionValue, "Solicitacao KYC invalida");
  await kycRepository.transaction(async (repository) => {
    const submission = await repository.findSubmission(submissionId);
    if (!submission) throw new AppError("Solicitacao KYC nao encontrada", 404);
    if (submission.status !== "APROVADO") {
      throw new AppError("Somente um KYC aprovado pode ser revogado", 409);
    }
    const revoked = await repository.markKycRevoked({
      adminId,
      reason,
      submissionId,
      userId: submission.kyc_usuario.usuario.id,
    });
    if (!revoked) throw new AppError("Este KYC ja foi alterado", 409);
  });
  return getAdminKycSubmission(submissionId);
}
