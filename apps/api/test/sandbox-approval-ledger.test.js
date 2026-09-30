import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import { ensureUserWallets } from "../src/modules/wallet/wallet.service.js";
import { approveAdminSandboxPayment } from "../src/modules/admin/admin-payments.service.js";
import { processVerifiedPaymentEvent, requestAsaasPaymentRefund } from "../src/modules/payments/asaas.service.js";
import { assertSandboxLedgerIsolation, SANDBOX_AUDIT_ACTION } from "../src/modules/payments/sandbox-approval.js";

const enabled = process.env.SICREDI_DB_TESTS === "true";
const options = { skip: !enabled };
let owner, wallet, admin, store, server, baseUrl;
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/sicredi_validation"));
  Object.assign(process.env, {
    PAYMENTS_ENVIRONMENT: "sandbox", PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED: "true",
    SICREDI_MULTIPAG_ENV: "sandbox", SICREDI_PIX_ENV: "sandbox", ASAAS_ENABLED: "false",
    SICREDI_PIX_API_URL: "", SICREDI_PIX_AUTH_URL: "", SICREDI_MULTIPAG_API_URL: "", SICREDI_MULTIPAG_AUTH_URL: "",
  });
  owner = await prisma.usuario.create({ data: { nome: "Sandbox approval test", email: `${randomUUID()}@sandbox.local`, senha_hash: "unused", status: "ATIVO" } });
  admin = await prisma.administrador.create({ data: { nome: "Sandbox admin", email: `${randomUUID()}@sandbox.local`, senha_hash: "unused", papel: "FINANCEIRO" } });
  await ensureUserWallets(owner.id);
  wallet = await prisma.carteira.findFirstOrThrow({ where: { usuario_id: owner.id, tipo_carteira: { codigo: "saldo_pix" } } });
  const merchant = await prisma.lojista.create({ data: { usuario_id: owner.id, tipo_pessoa: "JURIDICA", status: "ATIVO" } });
  const category = await prisma.categoriaLoja.create({ data: { nome: "Test" } });
  store = await prisma.loja.create({ data: { lojista_id: merchant.id, categoria_id: category.id, nome: "Sandbox store", slug: randomUUID(), status: "ATIVA" } });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (enabled) await prisma.$disconnect();
});
async function payment(extra = {}) {
  return prisma.pagamento.create({ data: {
    usuario_pagador_id: owner.id, gateway: "SICREDI", gateway_ambiente: "sandbox", status: "AGUARDANDO_PAGAMENTO",
    metodo_principal: "PIX", valor_total_centavos: 2010n, valor_pago_pix_centavos: 2010n,
    composicoes: { create: { tipo_origem: "PIX", status: "PENDENTE", valor_centavos: 2010n } }, ...extra,
  } });
}
const approval = { action: "pay", reason: "Teste manual autorizado" };

test("aprovacao concorrente credita deposito uma vez e audita na mesma transacao", options, async () => {
  const row = await payment({ deposito_carteira: { create: { usuario_id: owner.id, carteira_id: wallet.id,
    chave_idempotencia: randomUUID(), valor_centavos: 2010n, taxa_processamento_centavos: 99n, valor_liquido_centavos: 1911n } } });
  const before = (await prisma.carteira.findUnique({ where: { id: wallet.id } })).saldo_disponivel_centavos;
  const results = await Promise.allSettled([
    approveAdminSandboxPayment(admin.id, row.id, approval), approveAdminSandboxPayment(admin.id, row.id, approval),
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  const updated = await prisma.pagamento.findUnique({ where: { id: row.id } });
  assert.equal(updated.status, "PAGO");
  assert.equal(updated.gateway_dados_json.sandboxManualApproval.adminId, admin.id);
  await processVerifiedPaymentEvent({ id: randomUUID(), event: "PAYMENT_DELETED",
    payment: { externalReference: `DTJ:PAYMENT:${row.id}` } }, "SICREDI");
  assert.equal((await prisma.pagamentoComposicao.findFirst({ where: { pagamento_id: row.id } })).status, "CONFIRMADO");
  assert.equal((await prisma.carteira.findUnique({ where: { id: wallet.id } })).saldo_disponivel_centavos, before + 1911n);
  assert.equal(await prisma.eventoGatewayPagamento.count({ where: { pagamento_id: row.id } }), 1);
  assert.equal(await prisma.auditoriaAdministrativa.count({ where: { acao: SANDBOX_AUDIT_ACTION, dados_json: { path: ["paymentId"], equals: row.id } } }), 1);
  await assert.rejects(approveAdminSandboxPayment(admin.id, row.id, approval), /nao aguarda/);
  await assert.rejects(assertSandboxLedgerIsolation(prisma, { PAYMENTS_ENVIRONMENT: "production" }), /banco limpo/);
});

test("checkout passa para RECEBIDO e cria mensagem; estorno manual reverte pelo fluxo normal", options, async () => {
  const row = await payment({ loja_id: store.id });
  const order = await prisma.pedidoLoja.create({ data: { codigo: `TEST-${row.id}`, usuario_id: owner.id, loja_id: store.id,
    pagamento_id: row.id, tipo_entrega: "RETIRADA", status: "AGUARDANDO_PAGAMENTO", subtotal_centavos: 2010n,
    total_centavos: 2010n, valor_pago_pix_centavos: 2010n } });
  await approveAdminSandboxPayment(admin.id, row.id, approval);
  assert.equal((await prisma.pedidoLoja.findUnique({ where: { id: order.id } })).status, "RECEBIDO");
  assert.equal(await prisma.pedidoLojaMensagem.count({ where: { pedido_id: order.id, titulo: "Pagamento confirmado" } }), 1);
  await requestAsaasPaymentRefund(row.id, { reason: "Teste de estorno" });
  await approveAdminSandboxPayment(admin.id, row.id, { action: "refund", reason: "Estorno manual de teste" });
  const updated = await prisma.pagamento.findUnique({ where: { id: row.id }, include: { composicoes: true } });
  assert.equal(updated.status, "ESTORNADO");
  assert.equal(updated.composicoes[0].status, "ESTORNADO");
  assert.equal((await prisma.pedidoLoja.findUnique({ where: { id: order.id } })).status, "CANCELADO");
  assert.equal(await prisma.auditoriaAdministrativa.count({ where: { dados_json: { path: ["paymentId"], equals: row.id } } }), 2);
});

test("falha de auditoria reverte evento e pagamento sem liberar saldo", options, async () => {
  const row = await payment();
  await assert.rejects(approveAdminSandboxPayment(2147483647, row.id, approval));
  assert.equal((await prisma.pagamento.findUnique({ where: { id: row.id } })).status, "AGUARDANDO_PAGAMENTO");
  assert.equal(await prisma.eventoGatewayPagamento.count({ where: { pagamento_id: row.id } }), 0);
});

test("parametro de simulacao do payload externo nao concede permissao manual", options, async () => {
  const row = await payment({ gateway: "ASAAS" });
  await processVerifiedPaymentEvent({ id: randomUUID(), event: "IGNORED", simulation: { manual: true, adminId: admin.id },
    payment: { externalReference: `DTJ:PAYMENT:${row.id}` } }, "ASAAS");
  assert.equal((await prisma.pagamento.findUnique({ where: { id: row.id } })).gateway_dados_json, null);
});

test("Pix Asaas + saldo: estorno manual restaura a parcela da carteira apenas uma vez", options, async () => {
  await prisma.carteira.update({ where: { id: wallet.id }, data: { saldo_disponivel_centavos: { decrement: 500n } } });
  const balance = (await prisma.carteira.findUnique({ where: { id: wallet.id } })).saldo_disponivel_centavos;
  const row = await payment({ gateway: "ASAAS", valor_total_centavos: 2510n, valor_pago_saldo_centavos: 500n,
    composicoes: { create: [
      { tipo_origem: "PIX", status: "PENDENTE", valor_centavos: 2010n },
      { tipo_origem: "SALDO_PIX", status: "CONFIRMADO", valor_centavos: 500n, carteira_id: wallet.id },
    ] } });
  await approveAdminSandboxPayment(admin.id, row.id, approval);
  await requestAsaasPaymentRefund(row.id, { reason: "Teste de estorno misto" });
  await approveAdminSandboxPayment(admin.id, row.id, { action: "refund", reason: "Teste misto aprovado" });
  await assert.rejects(approveAdminSandboxPayment(admin.id, row.id, { action: "refund", reason: "Teste misto repetido" }));
  assert.equal((await prisma.carteira.findUnique({ where: { id: wallet.id } })).saldo_disponivel_centavos, balance + 500n);
});

test("rota HTTP exige admin financeiro, flag e confirmacao explicita", options, async () => {
  const row = await payment();
  const support = await prisma.administrador.create({ data: { nome: "Support", email: `${randomUUID()}@sandbox.local`, senha_hash: "unused", papel: "SUPORTE" } });
  const tokenFor = (id) => jwt.sign({ tokenType: "access", accountType: "ADMIN" }, env.jwt.accessSecret,
    { subject: String(id), audience: "detudoja-admin", issuer: env.jwt.issuer, expiresIn: "5m" });
  async function post(token, body) {
    return fetch(`${baseUrl}/api/admin/payments/${row.id}/sandbox-approve`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  }
  const body = { ...approval, confirmation: "CONFIRMO_SANDBOX" };
  assert.equal((await post(null, body)).status, 401);
  assert.equal((await post(tokenFor(support.id), body)).status, 403);
  assert.equal((await post(tokenFor(admin.id), approval)).status, 400);
  process.env.PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED = "false";
  assert.equal((await post(tokenFor(admin.id), body)).status, 403);
  process.env.PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED = "true";
  const response = await post(tokenFor(admin.id), body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).payment.status, "PAGO");
});
