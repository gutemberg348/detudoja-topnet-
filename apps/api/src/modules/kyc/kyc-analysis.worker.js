import { env } from "../../config/env.js";
import { logError } from "../../config/logger.js";
import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";
import { readPrivateKycFile } from "./kyc-image.service.js";
import { analyzeKycSubmission } from "./kyc-recognition.service.js";
import { kycRepository } from "./kyc.repository.js";

const ANALYSIS_INTERVAL_MS = 5_000;
const INTERRUPTED_AFTER_MS = 15 * 60_000;

let interval = null;
let immediate = null;
let running = null;

function queuedImageWarnings(triage, fileType) {
  return Array.isArray(triage?.imageWarnings?.[fileType])
    ? triage.imageWarnings[fileType]
    : [];
}

async function loadAnalysisImages(submission, queuedTriage) {
  return Promise.all(submission.arquivos.map(async (file) => ({
    brightness: Number(file.brilho_medio ?? 0),
    buffer: await readPrivateKycFile(file.caminho_privado),
    contrast: Number(file.contraste_medio ?? 0),
    hash: file.sha256,
    height: file.altura,
    kind: file.tipo,
    mimeType: file.mime_type,
    size: file.tamanho_bytes,
    warnings: queuedImageWarnings(queuedTriage, file.tipo),
    width: file.largura,
  })));
}

async function completeAutomaticAnalysis(submission, triage) {
  await kycRepository.transaction(async (repository) => {
    const current = await repository.findSubmission(submission.id);
    if (!current || current.status !== "EM_ANALISE") return;

    const saved = await repository.updateSubmissionTriage(submission.id, triage);
    if (saved.count === 0) return;

    const decision = {
      adminId: null,
      reason: triage.decisionReason,
      submissionId: submission.id,
      userId: submission.kyc_usuario.usuario.id,
    };

    if (triage.automaticResult === "APROVADO") {
      const approved = await repository.markKycApproved(decision);
      if (approved) await repository.activateIndication(decision.userId);
    } else if (triage.automaticResult === "REPROVADO") {
      await repository.markKycRejected(decision);
    }
  });
}

async function processSubmission(submission) {
  const queuedTriage = submission.triagem_json ?? {};
  const processingTriage = {
    ...queuedTriage,
    processingStartedAt: new Date().toISOString(),
    processingStatus: "PROCESSANDO",
  };
  const claimed = await kycRepository.claimAutomaticSubmission(submission.id, processingTriage);
  if (claimed.count === 0) return false;

  try {
    const images = await loadAnalysisImages(submission, queuedTriage);
    const triage = await analyzeKycSubmission({
      cpf: submission.kyc_usuario.usuario.cpf,
      documentType: submission.tipo_documento,
      images,
      name: submission.kyc_usuario.usuario.nome,
      reusedByAnotherUser: Boolean(queuedTriage.reusedByAnotherUser),
    });
    await completeAutomaticAnalysis(submission, {
      ...triage,
      processingFinishedAt: new Date().toISOString(),
      processingStatus: "CONCLUIDO",
    });
    recordComponentSuccess("kyc-analysis", {
      result: triage.automaticResult,
      submissionId: submission.id,
    });
  } catch (error) {
    logError("kyc.automatic_analysis_failed", error, { submissionId: submission.id });
    recordComponentFailure("kyc-analysis", error, { submissionId: submission.id });
    await kycRepository.updateSubmissionTriage(submission.id, {
      ...queuedTriage,
      automaticResult: "EM_ANALISE",
      decisionReason: "A analise automatica nao foi concluida. O envio foi encaminhado para revisao segura.",
      engineError: error?.message ?? "UNKNOWN_ANALYSIS_ERROR",
      manualChecksRequired: ["FALHA_TECNICA_NA_ANALISE_AUTOMATICA"],
      processingFinishedAt: new Date().toISOString(),
      processingStatus: "FALHA",
    });
  }

  return true;
}

async function recoverInterruptedAnalyses() {
  const interrupted = await kycRepository.findInterruptedAutomaticSubmissions(
    new Date(Date.now() - INTERRUPTED_AFTER_MS),
  );
  for (const submission of interrupted) {
    await kycRepository.updateSubmissionTriage(submission.id, {
      ...(submission.triagem_json ?? {}),
      processingStatus: "PENDENTE",
      recoveredAt: new Date().toISOString(),
    });
  }
}

export async function runKycAnalysisCycle() {
  if (env.kyc.mode !== "automatic" || !env.kyc.workerEnabled) return;
  if (running) return running;

  running = (async () => {
    await recoverInterruptedAnalyses();
    let processed = 0;
    while (processed < 3) {
      const submission = await kycRepository.findNextAutomaticSubmission();
      if (!submission) break;
      await processSubmission(submission);
      processed += 1;
    }
  })()
    .catch((error) => {
      logError("kyc.analysis_cycle_failed", error);
      recordComponentFailure("kyc-analysis", error);
    })
    .finally(() => {
      running = null;
    });

  return running;
}

export function requestKycAnalysis() {
  if (immediate || running || env.kyc.mode !== "automatic" || !env.kyc.workerEnabled) return;
  immediate = setImmediate(() => {
    immediate = null;
    void runKycAnalysisCycle();
  });
  immediate.unref?.();
}

export function startKycAnalysisWorker({ keepAlive = false } = {}) {
  if (interval || env.kyc.mode !== "automatic" || !env.kyc.workerEnabled) return;
  recordComponentStarting("kyc-analysis");
  requestKycAnalysis();
  interval = setInterval(() => void runKycAnalysisCycle(), ANALYSIS_INTERVAL_MS);
  if (!keepAlive) interval.unref?.();
}

export async function stopKycAnalysisWorker() {
  if (immediate) {
    clearImmediate(immediate);
    immediate = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  await running;
}
