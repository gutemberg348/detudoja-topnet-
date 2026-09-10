import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import argon2 from "argon2";
import sharp from "sharp";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { kycPrivateRoot } from "../src/config/storage.js";

const account = {
  address: { city: "Patos", district: "Centro", number: "10", state: "PB", street: "Rua KYC", zipCode: "58700000" },
  cpf: "39053344705",
  email: "kyc-flow@detudoja.local",
  name: "Pessoa Teste KYC",
  password: "senha-kyc-123",
  phone: "11933332222",
};
const admin = {
  email: "kyc-admin@detudoja.local",
  password: "senha-admin-kyc-123",
};
const categoryName = "Categoria exclusiva do teste KYC";

let baseUrl;
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
      prisma.auditoriaAdministrativa.deleteMany({ where: { usuario_alvo_id: user.id } }),
      prisma.loja.deleteMany({ where: { lojista: { usuario_id: user.id } } }),
      prisma.vendedor.deleteMany({ where: { usuario_id: user.id } }),
      prisma.lojista.deleteMany({ where: { usuario_id: user.id } }),
      prisma.categoriaLoja.deleteMany({ where: { nome: categoryName } }),
      prisma.indicacao.deleteMany({
        where: { OR: [{ indicado_usuario_id: user.id }, { indicador_usuario_id: user.id }] },
      }),
      prisma.codigoConvite.deleteMany({ where: { usuario_id: user.id } }),
      prisma.lancamentoCarteira.deleteMany({ where: { usuario_id: user.id } }),
      prisma.carteira.deleteMany({ where: { usuario_id: user.id } }),
      prisma.usuario.delete({ where: { id: user.id } }),
    ]);
  }
  for (const directory of directories) {
    await rm(path.resolve(kycPrivateRoot, directory), { force: true, recursive: true });
  }
  await prisma.administrador.deleteMany({ where: { email: admin.email } });
}

async function request(route, { body, method, token } = {}) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${baseUrl}${route}`, {
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    headers: {
      ...(!isForm && body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method: method ?? (body ? "POST" : "GET"),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer();
  return { data, status: response.status };
}

async function image(color) {
  return sharp({ create: { background: color, channels: 3, height: 900, width: 1200 } })
    .jpeg()
    .toBuffer();
}

function kycForm(front, back, selfie) {
  const form = new FormData();
  form.append("documentType", "RG");
  form.append("documentFront", new Blob([front], { type: "image/jpeg" }), "frente.jpg");
  form.append("documentBack", new Blob([back], { type: "image/jpeg" }), "verso.jpg");
  form.append("selfie", new Blob([selfie], { type: "image/jpeg" }), "selfie.jpg");
  return form;
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  await prisma.administrador.create({
    data: {
      email: admin.email,
      nome: "Analista KYC",
      papel: "KYC",
      senha_hash: await argon2.hash(admin.password),
      status: "ATIVO",
    },
  });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await cleanup();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test("modo KYC legado permite decisao humana e protege os arquivos", async () => {
  const registration = await request("/api/app/auth/register", {
    body: {
      address: account.address,
      email: account.email,
      name: account.name,
      password: account.password,
      phone: account.phone,
    },
  });
  assert.equal(registration.status, 201);
  const token = registration.data.accessToken;

  const cpf = await request("/api/app/auth/complete-cpf", { body: { cpf: account.cpf }, token });
  assert.equal(cpf.status, 200);

  const repeated = await image({ b: 100, g: 100, r: 100 });
  const repeatedResponse = await request("/api/app/kyc/submissions", {
    body: kycForm(repeated, repeated, repeated),
    token,
  });
  assert.equal(repeatedResponse.status, 400);

  const [front, back, selfie] = await Promise.all([
    image({ b: 230, g: 210, r: 180 }),
    image({ b: 180, g: 220, r: 210 }),
    image({ b: 190, g: 170, r: 220 }),
  ]);
  const simultaneous = await Promise.all([
    request("/api/app/kyc/submissions", { body: kycForm(front, back, selfie), token }),
    request("/api/app/kyc/submissions", { body: kycForm(front, back, selfie), token }),
  ]);
  assert.deepEqual(simultaneous.map((item) => item.status).sort(), [201, 409]);
  const submission = simultaneous.find((item) => item.status === 201);
  assert.equal(submission.status, 201);
  assert.equal(submission.data.kyc.status, "EM_ANALISE");
  assert.equal(submission.data.user.kycStatus, "EM_ANALISE");
  assert.deepEqual(Object.keys(submission.data.kyc.submission.automaticReview), ["result"]);
  assert.equal(typeof submission.data.kyc.submission.automaticReview.result, "string");

  const adminLogin = await request("/api/admin/auth/login", {
    body: { login: admin.email, password: admin.password },
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.data.accessToken;
  const queue = await request("/api/admin/kyc/submissions?status=EM_ANALISE", { token: adminToken });
  assert.equal(queue.status, 200);
  assert.equal(queue.data.submissions.length, 1);
  const pending = queue.data.submissions[0];
  assert.equal(pending.files.length, 3);
  assert.equal(pending.automaticReview.version, 1);

  const privateWithoutToken = await request(pending.files[0].url);
  assert.equal(privateWithoutToken.status, 401);
  const privateWithToken = await request(pending.files[0].url, { token: adminToken });
  assert.equal(privateWithToken.status, 200);
  assert.ok(privateWithToken.data.byteLength > 100);

  const approval = await request(`/api/admin/kyc/submissions/${pending.id}/approve`, {
    body: { reason: "Documento, CPF e selfie conferidos manualmente." },
    token: adminToken,
  });
  assert.equal(approval.status, 200);
  assert.equal(approval.data.submission.status, "APROVADO");

  const duplicateDecision = await request(`/api/admin/kyc/submissions/${pending.id}/reject`, {
    body: { reason: "Tentativa de segunda decisao administrativa." },
    token: adminToken,
  });
  assert.equal(duplicateDecision.status, 409);

  const storedUser = await prisma.usuario.findUnique({ include: { kyc: true }, where: { email: account.email } });
  assert.equal(storedUser.kyc.status, "APROVADO");
  assert.equal(storedUser.nivel_kyc, "TIER_2");

  const category = await prisma.categoriaLoja.create({ data: { nome: categoryName } });
  const merchant = await prisma.lojista.create({
    data: {
      cpf: account.cpf,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: storedUser.id,
    },
  });
  const store = await prisma.loja.create({
    data: {
      aberta_para_pedidos: true,
      categoria_id: category.id,
      lojista_id: merchant.id,
      nome: "Loja KYC revogavel",
      slug: "loja-kyc-revogavel",
      status: "ATIVA",
      visivel_no_app: true,
    },
  });
  const seller = await prisma.vendedor.create({
    data: {
      cpf: account.cpf,
      nome_publico: "Prestador KYC revogavel",
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: storedUser.id,
    },
  });
  const service = await prisma.servicoVendedor.create({
    data: { disponivel_agora: true, nome: "Servico KYC", status: "ATIVO", vendedor_id: seller.id },
  });
  const courier = await prisma.motoboy.create({
    data: {
      aceita_chamadas_plataforma: true,
      cidade_base: "Patos",
      cnh: "KYC-TESTE-CNH",
      estado_base: "PB",
      modelo_moto: "Moto KYC",
      nome_exibicao: "Motoboy KYC",
      placa: "KYC1A23",
      telefone_contato: account.phone,
      vendedor_id: seller.id,
    },
  });

  const revocation = await request(`/api/admin/kyc/submissions/${pending.id}/revoke`, {
    body: { reason: "Identidade revogada por incidente confirmado." },
    token: adminToken,
  });
  assert.equal(revocation.status, 200);
  assert.equal(revocation.data.submission.status, "BLOQUEADO");

  const blockedUser = await prisma.usuario.findUnique({ include: { kyc: true }, where: { email: account.email } });
  assert.equal(blockedUser.status, "BLOQUEADO");
  assert.equal(blockedUser.kyc.status, "BLOQUEADO");
  assert.equal(blockedUser.nivel_kyc, "BLOQUEADO");
  assert.deepEqual(
    await prisma.lojista.findUnique({ select: { status: true, status_kyc: true }, where: { id: merchant.id } }),
    { status: "BLOQUEADO", status_kyc: "BLOQUEADO" },
  );
  assert.deepEqual(
    await prisma.loja.findUnique({ select: { aberta_para_pedidos: true, status: true, visivel_no_app: true }, where: { id: store.id } }),
    { aberta_para_pedidos: false, status: "BLOQUEADA", visivel_no_app: false },
  );
  assert.deepEqual(
    await prisma.vendedor.findUnique({ select: { atende_agora: true, status: true, status_kyc: true }, where: { id: seller.id } }),
    { atende_agora: false, status: "BLOQUEADO", status_kyc: "BLOQUEADO" },
  );
  assert.deepEqual(
    await prisma.servicoVendedor.findUnique({ select: { disponivel_agora: true, status: true }, where: { id: service.id } }),
    { disponivel_agora: false, status: "PAUSADO" },
  );
  assert.deepEqual(
    await prisma.motoboy.findUnique({ select: { aceita_chamadas_plataforma: true, status: true }, where: { id: courier.id } }),
    { aceita_chamadas_plataforma: false, status: "BLOQUEADO" },
  );
  assert.equal(await prisma.sessaoAutenticacao.count({
    where: { revogada_em: null, usuario_id: blockedUser.id },
  }), 0);
  assert.equal(await prisma.auditoriaAdministrativa.count({
    where: { acao: "KYC_REVOGADO", usuario_alvo_id: blockedUser.id },
  }), 1);
});
