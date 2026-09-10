import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { env } from "../../config/env.js";

const require = createRequire(import.meta.url);
const portugueseLanguage = require("@tesseract.js-data/por");
const ignoredNameTokens = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);
const documentMarkers = {
  CNH: ["CARTEIRA NACIONAL DE HABILITACAO", "PERMISSAO PARA DIRIGIR", "HABILITACAO"],
  RG: ["CARTEIRA DE IDENTIDADE", "REGISTRO GERAL", "CARTEIRA DE IDENTIDADE NACIONAL"],
  RNE: ["REGISTRO NACIONAL MIGRATORIO", "CEDULA DE IDENTIDADE DE ESTRANGEIRO", "MIGRATORIO"],
};

let humanPromise;
let analysisQueue = Promise.resolve();

function round(value, precision = 3) {
  if (!Number.isFinite(value)) return 0;
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export function normalizeRecognitionText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function nameTokens(value) {
  return normalizeRecognitionText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !ignoredNameTokens.has(token));
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function tokenMatches(expected, recognized) {
  if (expected === recognized) return true;
  if (expected.length < 4 || recognized.length < 4) return false;
  const distance = editDistance(expected, recognized);
  return 1 - distance / Math.max(expected.length, recognized.length) >= 0.8;
}

export function compareRegisteredName(registeredName, recognizedText) {
  const expected = nameTokens(registeredName);
  const recognized = nameTokens(recognizedText);
  const consumed = new Set();
  const matched = expected.filter((token) => {
    const matchIndex = recognized.findIndex(
      (candidate, index) => !consumed.has(index) && tokenMatches(token, candidate),
    );
    if (matchIndex < 0) return false;
    consumed.add(matchIndex);
    return true;
  });
  return {
    matchedTokens: matched.length,
    score: expected.length ? round(matched.length / expected.length) : 0,
    totalTokens: expected.length,
  };
}

function documentContainsCpf(cpf, text) {
  const expected = String(cpf ?? "").replace(/\D/g, "");
  if (expected.length !== 11) return false;
  if (String(text ?? "").replace(/\D/g, "").includes(expected)) return true;

  const candidates = String(text ?? "").toUpperCase().match(/[0-9OIL.\-/ ]{11,24}/g) ?? [];
  return candidates.some((candidate) => candidate
    .replace(/[O]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/\D/g, "")
    .includes(expected));
}

function documentTypeDetected(documentType, normalizedText) {
  return documentMarkers[documentType].some((marker) => normalizedText.includes(marker));
}

async function recognizeDocuments(images) {
  const worker = await createWorker(portugueseLanguage.code, 1, {
    cacheMethod: "none",
    gzip: portugueseLanguage.gzip,
    langPath: portugueseLanguage.langPath,
    logger: () => {},
  });

  try {
    const results = [];
    for (const image of images) {
      const result = await worker.recognize(image.buffer);
      results.push({ confidence: Number(result.data.confidence ?? 0), text: result.data.text ?? "" });
    }
    return {
      confidence: round(results.reduce((total, result) => total + result.confidence, 0) / results.length, 1),
      text: results.map((result) => result.text).join("\n"),
    };
  } finally {
    await worker.terminate();
  }
}

function humanPaths() {
  const humanEntry = require.resolve("@vladmandic/human");
  const humanRoot = path.resolve(path.dirname(humanEntry), "..");
  const wasmEntry = require.resolve("@tensorflow/tfjs-backend-wasm");
  return {
    module: path.join(path.dirname(humanEntry), "human.node-wasm.js"),
    models: `${path.join(humanRoot, "models")}${path.sep}`,
    wasm: `${path.dirname(wasmEntry)}${path.sep}`,
  };
}

async function loadHuman() {
  if (humanPromise) return humanPromise;

  humanPromise = (async () => {
    const paths = humanPaths();
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url?.startsWith("file:")) {
        return new Response(await readFile(fileURLToPath(url)));
      }
      return nativeFetch(input, init);
    };

    try {
      const HumanModule = require(paths.module);
      const human = new HumanModule.Human({
        backend: "wasm",
        body: { enabled: false },
        cacheModels: false,
        debug: false,
        face: {
          antispoof: { enabled: true },
          description: { enabled: true },
          detector: { enabled: true, maxDetected: 3 },
          emotion: { enabled: false },
          enabled: true,
          iris: { enabled: false },
          liveness: { enabled: true },
          mesh: { enabled: true },
        },
        gesture: { enabled: false },
        hand: { enabled: false },
        modelBasePath: pathToFileURL(paths.models).href,
        object: { enabled: false },
        wasmPath: pathToFileURL(paths.wasm).href,
      });
      await human.tf.ready();
      await human.load();
      return human;
    } finally {
      globalThis.fetch = nativeFetch;
    }
  })().catch((error) => {
    humanPromise = null;
    throw error;
  });

  return humanPromise;
}

async function detectFaces(human, image) {
  const { data, info } = await sharp(image.buffer)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tensor = human.tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, info.channels],
    "int32",
  );

  try {
    const result = await human.detect(tensor);
    return result.face ?? [];
  } finally {
    tensor.dispose();
  }
}

function bestDocumentFace(faceGroups) {
  return faceGroups
    .flat()
    .filter((face) => face.embedding?.length)
    .sort((left, right) => {
      const leftArea = (left.boxRaw?.[2] ?? 0) * (left.boxRaw?.[3] ?? 0) * (left.score ?? 0);
      const rightArea = (right.boxRaw?.[2] ?? 0) * (right.boxRaw?.[3] ?? 0) * (right.score ?? 0);
      return rightArea - leftArea;
    })[0] ?? null;
}

function buildFailure(code, message) {
  return { code, message };
}

function isCalibrationSample(images) {
  const rate = env.kyc.calibrationSampleRate;
  if (rate <= 0) return false;
  if (rate >= 1) return true;

  const source = images.map((image) => image.hash).join("");
  const bucket = Number.parseInt(source.slice(0, 8), 16) / 0xffffffff;
  return bucket < rate;
}

export function decideAutomaticKycOutcome({ failures = [], manualChecksRequired = [] }) {
  if (failures.length > 0) return "REPROVADO";
  if (manualChecksRequired.length > 0) return "EM_ANALISE";
  return "APROVADO";
}

async function runAnalysis({ cpf, documentType, images, name, reusedByAnotherUser }) {
  const documentImages = images.filter((image) => image.kind !== "SELFIE");
  const selfieImage = images.find((image) => image.kind === "SELFIE");
  const [ocr, human] = await Promise.all([recognizeDocuments(documentImages), loadHuman()]);
  const normalizedOcr = normalizeRecognitionText(ocr.text);
  const nameMatch = compareRegisteredName(name, ocr.text);
  const documentFaces = [];

  for (const image of documentImages) {
    documentFaces.push(await detectFaces(human, image));
  }
  const selfieFaces = await detectFaces(human, selfieImage);
  const documentFace = bestDocumentFace(documentFaces);
  const selfieFace = selfieFaces.length === 1 ? selfieFaces[0] : null;
  const faceArea = selfieFace
    ? (selfieFace.boxRaw?.[2] ?? 0) * (selfieFace.boxRaw?.[3] ?? 0)
    : 0;
  const similarity = documentFace?.embedding && selfieFace?.embedding
    ? human.match.similarity(documentFace.embedding, selfieFace.embedding)
    : 0;
  const cpfMatched = documentContainsCpf(cpf, ocr.text);
  const failures = [];
  const manualChecksRequired = [];
  const documentTypeIsDetected = documentTypeDetected(documentType, normalizedOcr);
  const calibrationSample = isCalibrationSample(images);

  if (reusedByAnotherUser) failures.push(buildFailure("IMAGEM_REUTILIZADA", "Uma das fotos ja foi usada por outra conta."));
  if (!cpfMatched) failures.push(buildFailure("CPF_NAO_CONFIRMADO", "Nao conseguimos confirmar o CPF no documento."));
  if (nameMatch.score < env.kyc.nameMatchThreshold) failures.push(buildFailure("NOME_NAO_CONFIRMADO", "Nao conseguimos confirmar o nome completo no documento."));
  if (!documentFace) failures.push(buildFailure("ROSTO_AUSENTE_NO_DOCUMENTO", "O rosto nao ficou visivel no documento."));
  if (selfieFaces.length === 0) failures.push(buildFailure("ROSTO_AUSENTE_NA_SELFIE", "Nenhum rosto foi identificado na selfie."));
  if (selfieFaces.length > 1) failures.push(buildFailure("MAIS_DE_UM_ROSTO", "A selfie deve mostrar somente o titular."));
  if (selfieFace && faceArea < env.kyc.minimumFaceArea) failures.push(buildFailure("ROSTO_DISTANTE", "Aproxime o rosto da camera e tente novamente."));
  if (selfieFace && Number(selfieFace.real ?? 0) < env.kyc.antispoofThreshold) failures.push(buildFailure("SELFIE_NAO_REAL", "A prova de identidade da selfie nao foi suficiente."));
  if (selfieFace && Number(selfieFace.live ?? 0) < env.kyc.livenessThreshold) failures.push(buildFailure("PROVA_DE_VIDA_INSUFICIENTE", "A prova de vida nao atingiu a seguranca necessaria."));
  if (documentFace && selfieFace && similarity < env.kyc.faceMatchThreshold) failures.push(buildFailure("ROSTOS_DIVERGENTES", "A selfie nao corresponde ao rosto do documento."));
  if (failures.length === 0) {
    if (!documentTypeIsDetected) manualChecksRequired.push("TIPO_DOCUMENTO_NAO_CONFIRMADO");
    if (ocr.confidence < env.kyc.ocrConfidenceThreshold) manualChecksRequired.push("OCR_COM_BAIXA_CONFIANCA");
    if (images.some((image) => image.warnings.length)) manualChecksRequired.push("QUALIDADE_DA_IMAGEM");
    if (calibrationSample) manualChecksRequired.push("AMOSTRA_DE_CALIBRACAO");
    if (!env.kyc.automaticApprovalEnabled) manualChecksRequired.push("APROVACAO_AUTOMATICA_DESABILITADA");
  }

  const result = decideAutomaticKycOutcome({ failures, manualChecksRequired });
  const approved = result === "APROVADO";
  return {
    automaticResult: result,
    checksPerformed: [
      "FORMATO_REAL",
      "DIMENSOES",
      "ILUMINACAO",
      "CONTRASTE",
      "ARQUIVOS_REPETIDOS",
      "OCR_DOCUMENTO",
      "CPF_DOCUMENTO",
      "NOME_DOCUMENTO",
      "ROSTO_DOCUMENTO",
      "COMPARACAO_FACIAL",
      "ANTISPOOF_PASSIVO",
      "LIVENESS_PASSIVO",
    ],
    decisionReason: approved
      ? "Identidade aprovada automaticamente por OCR, comparacao facial e prova de vida passiva."
      : failures[0]?.message ?? "Envio separado para calibracao e validacao adicional antes de liberar limites altos.",
    engine: "LOCAL_HUMAN_TESSERACT",
    failures,
    manualChecksRequired,
    metrics: {
      cpfMatched,
      documentFaceDetected: Boolean(documentFace),
      documentTypeDetected: documentTypeIsDetected,
      faceMatch: round(similarity),
      nameMatch: nameMatch.score,
      ocrConfidence: ocr.confidence,
      selfieFaceArea: round(faceArea),
      selfieFaces: selfieFaces.length,
      selfieLive: round(selfieFace?.live),
      selfieReal: round(selfieFace?.real),
    },
    thresholds: {
      antispoof: env.kyc.antispoofThreshold,
      faceMatch: env.kyc.faceMatchThreshold,
      liveness: env.kyc.livenessThreshold,
      minimumFaceArea: env.kyc.minimumFaceArea,
      nameMatch: env.kyc.nameMatchThreshold,
      ocrConfidence: env.kyc.ocrConfidenceThreshold,
    },
    version: 3,
    warnings: [
      ...images.flatMap((image) => image.warnings.map((warning) => ({ file: image.kind, warning }))),
      ...(reusedByAnotherUser ? [{ file: "ENVIO", warning: "IMAGEM_REUTILIZADA" }] : []),
    ],
  };
}

export function analyzeKycSubmission(input) {
  const task = analysisQueue.then(() => runAnalysis(input));
  analysisQueue = task.catch(() => {});
  return task;
}
