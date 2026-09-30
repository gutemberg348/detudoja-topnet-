import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { ensureUserWallets } from "../src/modules/wallet/wallet.service.js";
import { createSicrediPaymentService } from "../src/modules/payments/sicredi/sicredi.payment.service.js";
import { sicrediTxidForPayment } from "../src/modules/payments/sicredi/sicredi.pix.client.js";
import { processAsaasWebhook } from "../src/modules/payments/asaas.service.js";
import { reconcileWithdrawal, submitApprovedWithdrawal, processAsaasWithdrawalWebhook } from "../src/modules/withdrawals/withdrawal.service.js";
import { reconcilePayout, submitPendingPayout } from "../src/modules/payouts/payout.service.js";

// Explicit opt-in, restricted to an isolated local database. Never run fixtures
// against the application's DATABASE_URL just because .env happens to exist.
const enabled = process.env.SICREDI_DB_TESTS === "true";
const options = { skip: !enabled };
let owner, account, pixWallet, salesWallet;
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/sicredi_validation"), "Use banco local descartavel sicredi_validation");
  owner = await prisma.usuario.create({ data: { nome: "Sicredi ledger test", email: `${randomUUID()}@sicredi-test.local`, senha_hash: "unused", status: "ATIVO" } });
  await ensureUserWallets(owner.id);
  pixWallet = await prisma.carteira.findFirstOrThrow({ where: { usuario_id: owner.id, tipo_carteira: { codigo: "saldo_pix" } } });
  salesWallet = await prisma.carteira.findFirstOrThrow({ where: { usuario_id: owner.id, tipo_carteira: { codigo: "vendas" } } });
  account = await prisma.contaBancaria.create({ data: { usuario_id: owner.id, nome_titular: owner.nome, documento_titular: "11111111111", tipo_chave: "EMAIL", chave_pix: owner.email, status: "ATIVA", principal: true } });
  env.asaas.enabled = true; env.asaas.apiKey = "test-no-network";
});
after(async () => { if (enabled) await prisma.$disconnect(); });
async function payment(extra = {}) {
  const row = await prisma.pagamento.create({ data: { gateway: "SICREDI", gateway_ambiente: "sandbox", usuario_pagador_id: owner.id,
    metodo_principal: "PIX", valor_total_centavos: 2010n, valor_pago_pix_centavos: 2010n, status: "AGUARDANDO_PAGAMENTO",
    composicoes: { create: { status: "PENDENTE", tipo_origem: "PIX", valor_centavos: 2010n } }, ...extra } });
  return prisma.pagamento.update({ where: { id: row.id }, data: { gateway_pagamento_id: sicrediTxidForPayment(row.id) } });
}
function receiptService(row) {
  const e2eId = `E${String(row.id).padStart(31, "0")}`;
  return createSicrediPaymentService({ assertEnvironment() {}, receivingKey: "test-key", pixClient: {
    async getCharge() { return { txid: row.gateway_pagamento_id, chave: "test-key", valor: { original: "20.10" }, status: "CONCLUIDA", pix: [{ endToEndId: e2eId }] }; },
    async getReceivedPix() { return { txid: row.gateway_pagamento_id, endToEndId: e2eId, valor: "20.10" }; },
    async requestRefund({ refundId }) { return { id: refundId, valor: "20.10", status: "EM_PROCESSAMENTO" }; },
    async getRefund({ refundId }) { return { id: refundId, valor: "20.10", status: "DEVOLVIDO" }; },
  } });
}
test("ledger Sicredi: deposito confirmado por consultas concorrentes credita uma vez", options, async () => {
  const row = await payment({ deposito_carteira: { create: { usuario_id: owner.id, carteira_id: pixWallet.id, chave_idempotencia: randomUUID(), valor_centavos: 2010n, taxa_processamento_centavos: 99n, valor_liquido_centavos: 1911n } } });
  const service = receiptService(row);
  const balance = (await prisma.carteira.findUnique({ where: { id: pixWallet.id } })).saldo_disponivel_centavos;
  await Promise.all([service.reconcileSicrediPayment(row.id), service.reconcileSicrediPayment(row.id)]);
  await service.reconcileSicrediPayment(row.id);
  assert.equal((await prisma.carteira.findUnique({ where: { id: pixWallet.id } })).saldo_disponivel_centavos, balance + 1911n);
  assert.equal(await prisma.eventoGatewayPagamento.count({ where: { pagamento_id: row.id } }), 1);
});
test("ledger Sicredi: webhook Asaas nao pode confirmar um recebimento Sicredi", options, async () => {
  const row = await payment();
  await processAsaasWebhook({ id: randomUUID(), event: "PAYMENT_RECEIVED", payment: { id: row.gateway_pagamento_id, externalReference: `DTJ:PAYMENT:${row.id}` } });
  assert.equal((await prisma.pagamento.findUnique({ where: { id: row.id } })).status, "AGUARDANDO_PAGAMENTO");
});
test("ledger Sicredi: recebimento e devolucao usam composicoes e eventos idempotentes", options, async () => {
  const row = await payment(); const service = receiptService(row);
  await service.reconcileSicrediPayment(row.id);
  await service.requestSicrediRefund(row.id);
  await Promise.all([service.reconcileSicrediPayment(row.id), service.reconcileSicrediPayment(row.id)]);
  const result = await prisma.pagamento.findUnique({ where: { id: row.id }, include: { composicoes: true } });
  assert.equal(result.status, "ESTORNADO");
  assert.equal(result.composicoes[0].status, "ESTORNADO");
  assert.equal(await prisma.eventoGatewayPagamento.count({ where: { pagamento_id: row.id } }), 2);
});
async function withdrawal() {
  await prisma.carteira.update({ where: { id: pixWallet.id }, data: { saldo_bloqueado_centavos: { increment: 2010n } } });
  return prisma.saque.create({ data: { usuario_id: owner.id, carteira_id: pixWallet.id, conta_bancaria_id: account.id,
    gateway: "SICREDI", gateway_ambiente: "sandbox", referencia_externa: `DTJ-TEST-${randomUUID()}`, status: "APROVADO",
    valor_centavos: 2010n, valor_liquido_centavos: 2010n, tipo_chave_pix: "EMAIL", chave_pix_destino: owner.email,
    documento_titular: "11111111111", nome_titular: owner.nome } });
}
test("ledger Sicredi: saque incerto nao reenvia; duas confirmacoes retiram a reserva uma vez", options, async () => {
  const row = await withdrawal(); let sends = 0;
  const sendTransfer = async () => { sends++; throw Object.assign(new Error("timeout"), { providerStateUnknown: true }); };
  await submitApprovedWithdrawal(row.id, { sendTransfer });
  await submitApprovedWithdrawal(row.id, { sendTransfer });
  assert.equal(sends, 1);
  assert.equal((await prisma.saque.findUnique({ where: { id: row.id } })).status, "EM_RECONCILIACAO");
  const beforeBalance = (await prisma.carteira.findUnique({ where: { id: pixWallet.id } })).saldo_bloqueado_centavos;
  const lookupTransfer = async () => ({ id: row.referencia_externa, status: "DONE" });
  await Promise.all([reconcileWithdrawal(row.id, { lookupTransfer }), reconcileWithdrawal(row.id, { lookupTransfer })]);
  assert.equal((await prisma.carteira.findUnique({ where: { id: pixWallet.id } })).saldo_bloqueado_centavos, beforeBalance - 2010n);
  assert.equal(await prisma.lancamentoCarteira.count({ where: { origem: "SAQUE", origem_id: row.id, tipo_lancamento: "DEBITO", usuario_id: owner.id } }), 1);
  assert.equal((await prisma.saque.findUnique({ where: { id: row.id } })).status, "PAGO");
});
test("ledger Sicredi: 404 nao libera reserva nem webhook Asaas altera saque Sicredi", options, async () => {
  const row = await withdrawal();
  await submitApprovedWithdrawal(row.id, { sendTransfer: async () => ({ id: row.referencia_externa, status: "PENDING" }) });
  await reconcileWithdrawal(row.id, { lookupTransfer: async () => { throw new Error("404"); } });
  const result = await processAsaasWithdrawalWebhook({ id: randomUUID(), event: "TRANSFER_DONE", transfer: { id: row.referencia_externa } });
  assert.equal(result.handled, false);
  assert.equal((await prisma.saque.findUnique({ where: { id: row.id } })).status, "EM_RECONCILIACAO");
});
test("ledger Sicredi: repasse recusado concorrente devolve a carteira apenas uma vez", options, async () => {
  const row = await payment({ status: "PAGO" });
  const transaction = await prisma.transacaoComercial.create({ data: { pagamento_id: row.id, comprador_usuario_id: owner.id, valor_bruto_centavos: 2010n } });
  const receivable = await prisma.recebivel.create({ data: { transacao_comercial_id: transaction.id, usuario_recebedor_id: owner.id, tipo_recebedor: "LOJISTA", valor_bruto_centavos: 2010n, valor_liquido_centavos: 2010n } });
  const payout = await prisma.repassePix.create({ data: { transacao_comercial_id: transaction.id, recebivel_id: receivable.id, usuario_id: owner.id,
    conta_bancaria_id: account.id, valor_centavos: 2010n, tipo_chave: "EMAIL", chave_pix_destino: owner.email, nome_titular: owner.nome,
    documento_titular: "11111111111", referencia_externa: `DTJ-REPASSE-${transaction.id}`, gateway: "SICREDI", gateway_ambiente: "sandbox" } });
  let sends = 0;
  const sendTransfer = async () => { sends++; return { id: payout.referencia_externa, status: "PENDING" }; };
  await Promise.all([submitPendingPayout(payout.id, { sendTransfer }), submitPendingPayout(payout.id, { sendTransfer })]);
  assert.equal(sends, 1);
  const beforeBalance = (await prisma.carteira.findUnique({ where: { id: salesWallet.id } })).saldo_disponivel_centavos;
  const lookupTransfer = async () => ({ id: payout.referencia_externa, status: "FAILED" });
  await Promise.all([reconcilePayout(payout.id, { lookupTransfer }), reconcilePayout(payout.id, { lookupTransfer })]);
  assert.equal((await prisma.carteira.findUnique({ where: { id: salesWallet.id } })).saldo_disponivel_centavos, beforeBalance + 2010n);
  assert.equal((await prisma.repassePix.findUnique({ where: { id: payout.id } })).status, "FALHOU");
});
