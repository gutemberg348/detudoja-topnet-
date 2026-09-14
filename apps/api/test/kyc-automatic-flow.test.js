import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import { kycPrivateRoot } from "../src/config/storage.js";
import { compareRegisteredName, decideAutomaticKycOutcome } from "../src/modules/kyc/kyc-recognition.service.js";

const account = {
  address: { city: "Patos", district: "Centro", number: "20", state: "PB", street: "Rua KYC Automatico", zipCode: "58700000" },
  cpf: "52998224725",
  email: "kyc-automatic@detudoja.local",
  name: "Pessoa Automatica KYC",
  password: "senha-kyc-auto-123",
  phone: "11933334444",
};

let baseUrl;
let previousAutomaticApprovalEnabled;
let previousCalibrationSampleRate;
let previousMode;
let server;

async function cleanup() {
  const user = await prisma.usuario.findUnique({
    include: { kyc: { include: { solicitacoes: { include: { arquivos: true } } } } },
    where: { email: account.email },
  });
  const directories = new Set(
    user?.kyc?.solicitacoes.flatMap((submission) => submission.arquivos.map((file) => path.dirname(file.caminho_privado))) ?? [],
  );
  if (user) {
    await prisma.$transaction([
      prisma.indicacao.deleteMany({ where: { OR: [{ indicado_usuario_id: user.id }, { indicador_usuario_id: user.id }] } }),
      prisma.codigoConvite.deleteMany({ where: { usuario_id: user.id } }),
      prisma.lancamentoCarteira.deleteMany({ where: { usuario_id: user.id } }),
      prisma.carteira.deleteMany({ where: { usuario_id: user.id } }),
      prisma.usuario.delete({ where: { id: user.id } }),
    ]);
  }
  for (const directory of directories) {
    await rm(path.resolve(kycPrivateRoot, directory), { force: true, recursive: true });
  }
}

async function request(route, { body, token } = {}) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${baseUrl}${route}`, {
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    headers: {
      ...(!isForm && body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method: body ? "POST" : "GET",
  });
  return { data: await response.json(), status: response.status };
}

async function documentImage(label) {
  const svg = `<svg width="1200" height="900"><rect width="1200" height="900" fill="white"/><text x="40" y="120" font-size="52">CARTEIRA DE IDENTIDADE</text><text x="40" y="250" font-size="52">PESSOA AUTOMATICA KYC</text><text x="40" y="380" font-size="52">CPF 529.982.247-25</text><text x="40" y="510" font-size="44">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function waitForKycProcessingStatus(token, expectedStatus, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request("/api/app/kyc", { token });
    if (response.data.kyc.submission?.processingStatus === expectedStatus) return response.data;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`KYC nao chegou ao processamento ${expectedStatus} no prazo esperado`);
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  previousAutomaticApprovalEnabled = env.kyc.automaticApprovalEnabled;
  previousCalibrationSampleRate = env.kyc.calibrationSampleRate;
  previousMode = env.kyc.mode;
  env.kyc.automaticApprovalEnabled = true;
  env.kyc.calibrationSampleRate = 0;
  env.kyc.mode = "automatic";
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  env.kyc.automaticApprovalEnabled = previousAutomaticApprovalEnabled;
  env.kyc.calibrationSampleRate = previousCalibrationSampleRate;
  env.kyc.mode = previousMode;
  await cleanup();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test("comparacao de nome tolera um erro pequeno do OCR sem aceitar palavra diferente", () => {
  assert.equal(compareRegisteredName("Pessoa Automatica KYC", "PES5OA AUTOMAT1CA KYC").score, 1);
  assert.ok(compareRegisteredName("Pessoa Automatica KYC", "OUTRO TITULAR").score < 0.6);
});

test("KYC automatico nao libera TIER_2 quando a calibracao pede validacao adicional", () => {
  assert.equal(decideAutomaticKycOutcome({}), "APROVADO");
  assert.equal(decideAutomaticKycOutcome({ manualChecksRequired: ["AMOSTRA_DE_CALIBRACAO"] }), "EM_ANALISE");
  assert.equal(decideAutomaticKycOutcome({ manualChecksRequired: ["ROSTO_AUSENTE_NA_SELFIE"] }), "EM_ANALISE");
  assert.equal(decideAutomaticKycOutcome({ failures: [{ code: "SELFIE_NAO_REAL" }] }), "REPROVADO");
});

test("KYC automatico envia selfie sem rosto para revisao manual sem liberar TIER_2", async () => {
  const registration = await request("/api/app/auth/register", { body: {
    address: account.address,
    email: account.email,
    name: account.name,
    password: account.password,
    phone: account.phone,
  } });
  assert.equal(registration.status, 201);
  const token = registration.data.accessToken;
  assert.equal((await request("/api/app/auth/complete-cpf", { body: { cpf: account.cpf }, token })).status, 200);

  const [front, back, selfie] = await Promise.all([
    documentImage("FRENTE"),
    documentImage("VERSO"),
    sharp({ create: { background: "#888888", channels: 3, height: 1200, width: 900 } }).jpeg().toBuffer(),
  ]);
  const form = new FormData();
  form.append("documentType", "RG");
  form.append("documentFront", new Blob([front], { type: "image/jpeg" }), "frente.jpg");
  form.append("documentBack", new Blob([back], { type: "image/jpeg" }), "verso.jpg");
  form.append("selfie", new Blob([selfie], { type: "image/jpeg" }), "selfie.jpg");

  const response = await request("/api/app/kyc/submissions", { body: form, token });
  assert.equal(response.status, 202);
  assert.equal(response.data.kyc.status, "EM_ANALISE");
  assert.equal(response.data.kyc.submission.processingStatus, "PENDENTE");

  const analyzed = await waitForKycProcessingStatus(token, "CONCLUIDO");
  assert.equal(analyzed.kyc.status, "EM_ANALISE");
  assert.deepEqual(analyzed.kyc.submission.automaticReview, { result: "EM_ANALISE" });

  const stored = await prisma.usuario.findUnique({ include: { kyc: true }, where: { email: account.email } });
  assert.equal(stored.kyc.status, "EM_ANALISE");
  assert.equal(stored.nivel_kyc, "TIER_1");
  const storedSubmission = await prisma.solicitacaoKyc.findFirst({
    orderBy: { enviado_em: "desc" },
    where: { kyc_usuario_id: stored.kyc.id },
  });
  assert.equal(storedSubmission.triagem_json.version, 5);
  assert.equal(storedSubmission.triagem_json.engine, "LOCAL_HUMAN_TESSERACT");
  assert.ok(storedSubmission.triagem_json.manualChecksRequired.includes("ROSTO_AUSENTE_NA_SELFIE"));
  assert.equal(await prisma.solicitacaoKyc.count({ where: { kyc_usuario_id: stored.kyc.id, status: "EM_ANALISE" } }), 1);
});
