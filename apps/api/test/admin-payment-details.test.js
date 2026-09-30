import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelAdminPendingPayment,
  getAdminPaymentDetails,
  archiveAdminPayment,
  listAdminPayments,
} from "../src/modules/admin/admin-payments.service.js";
import { adminPaymentsRepository } from "../src/modules/admin/admin-payments.repository.js";
import { restorePaymentWalletCompositions } from "../src/modules/payments/payment-refund-wallet.service.js";

function paymentRow() {
  return {
    id: 42,
    criado_em: new Date("2026-09-30T10:00:00Z"),
    pago_em: new Date("2026-09-30T10:03:00Z"),
    cancelado_em: null,
    estornado_em: null,
    expira_em: null,
    gateway: "ASAAS",
    gateway_ambiente: "sandbox",
    gateway_pagamento_id: "pay_42",
    gateway_dados_json: {},
    metodo_principal: "PIX",
    status: "PAGO",
    valor_total_centavos: 10000n,
    valor_pago_pix_centavos: 8000n,
    valor_pago_saldo_centavos: 2000n,
    usuario_pagador: { id: 1, nome: "Cliente", email: "cliente@example.test" },
    usuario_pagador_id: 1,
    loja: { id: 2, nome: "Loja" },
    pedido_loja: { id: 3, codigo: "PED-3", status: "RECEBIDO" },
    itens: [{ id: 4, nome_item: "Produto", quantidade: 1,
      valor_unitario_centavos: 10000n, valor_total_centavos: 10000n }],
    composicoes: [{ id: 5, tipo_origem: "SALDO", valor_centavos: 2000n,
      status: "CONFIRMADO", carteira: { tipo_carteira: { nome: "Saldo Pix" } } }],
    deposito_carteira: null,
    eventos_financeiros: [{ id: 6, tipo_evento: "PAGAMENTO_APROVADO", descricao: "Confirmado",
      criado_em: new Date("2026-09-30T10:03:00Z") }],
    transacao_comercial: {
      id: 7, status: "PENDENTE", validada_em: null, liquidada_em: null,
      valor_bruto_centavos: 10000n, taxa_plataforma_centavos: 1000n,
      taxa_processamento_centavos: 100n, cashback_prioritario_centavos: 300n,
      valor_liquido_lojista_centavos: 8900n, valor_pool_recompensas_centavos: 200n,
      valor_empresa_centavos: 500n,
      recebiveis: [{ id: 8, tipo_recebedor: "LOJISTA", status: "BLOQUEADO",
        valor_bruto_centavos: 9000n, valor_liquido_centavos: 8900n,
        disponivel_em: null, pago_em: null,
        usuario_recebedor: { id: 9, nome: "Lojista", email: "loja@example.test" } }],
      recompensas: [{ id: 10, tipo_recompensa: "CASHBACK", status: "BLOQUEADA",
        valor_centavos: 300n, liberado_em: null, estornado_em: null,
        usuario_beneficiado: { id: 1, nome: "Cliente", email: "cliente@example.test" } }],
      lancamentos_plataforma: [], repasse_pix: null,
    },
  };
}

test("detalhe financeiro exibe destinatarios e centavos sem publicar dados brutos do gateway", async () => {
  const original = adminPaymentsRepository.findPaymentDetails;
  const originalWalletEntries = adminPaymentsRepository.findWalletEntriesForTransaction;
  adminPaymentsRepository.findPaymentDetails = async () => paymentRow();
  adminPaymentsRepository.findWalletEntriesForTransaction = async () => [{
    id: 11, origem: "CASHBACK", tipo_lancamento: "CREDITO", status: "PENDENTE",
    valor_centavos: 300n, usuario: { id: 1, nome: "Cliente", email: "cliente@example.test" },
    carteira: { tipo_carteira: { nome: "Cashback" } }, descricao: "Cashback da venda",
    criado_em: new Date("2026-09-30T10:04:00Z"),
  }];
  try {
    const details = await getAdminPaymentDetails(42);
    assert.equal(details.payment.gateway, "ASAAS");
    assert.equal(details.payment.totalCents, 10000);
    assert.equal(details.sources[0].walletType, "Saldo Pix");
    assert.equal(details.settlement.receivables[0].recipient.nome, "Lojista");
    assert.equal(details.settlement.rewards[0].recipient.nome, "Cliente");
    assert.equal(details.settlement.transfer, null);
    assert.equal(details.walletEntries[0].recipient.nome, "Cliente");
    assert.equal(details.walletEntries[0].amountCents, 300);
    assert.doesNotMatch(JSON.stringify(details), /gateway_dados_json|copia_cola_pix|qr_code/);
  } finally {
    adminPaymentsRepository.findPaymentDetails = original;
    adminPaymentsRepository.findWalletEntriesForTransaction = originalWalletEntries;
  }
});

test("painel nao cancela um pagamento ja confirmado", async () => {
  const original = adminPaymentsRepository.findPayment;
  adminPaymentsRepository.findPayment = async () => paymentRow();
  try {
    await assert.rejects(cancelAdminPendingPayment(1, 42, { reason: "Teste cancelamento" }),
      /Somente cobranca Pix/);
  } finally { adminPaymentsRepository.findPayment = original; }
});

test("arquivo administrativo recusa pagamento ativo sem alterar o historico", async () => {
  const original = adminPaymentsRepository.findPayment;
  adminPaymentsRepository.findPayment = async () => paymentRow();
  try {
    await assert.rejects(archiveAdminPayment(1, 42, {
      archived: true, reason: "Encerramento de teste",
    }), /transacoes encerradas/);
  } finally { adminPaymentsRepository.findPayment = original; }
});

test("arquivo administrativo guarda motivo e preserva a transacao", async () => {
  const originalFind = adminPaymentsRepository.findPayment;
  const originalTransaction = adminPaymentsRepository.transaction;
  const row = { ...paymentRow(), status: "ESTORNADO" };
  let audit = null;
  let archivedValue = null;
  adminPaymentsRepository.findPayment = async () => row;
  adminPaymentsRepository.transaction = async (work) => work({
    updatePaymentArchive: async (_id, archived) => { archivedValue = archived; return { count: 1 }; },
    createAudit: async (data) => { audit = data; },
    findPayment: async () => ({ ...row, arquivado_admin_em: new Date("2026-09-30T12:00:00Z") }),
  });
  try {
    const result = await archiveAdminPayment(7, 42, { archived: true, reason: "Teste concluido" });
    assert.equal(archivedValue, true);
    assert.equal(audit.acao, "PAGAMENTO_ARQUIVADO_ADMIN");
    assert.equal(audit.dados_json.reason, "Teste concluido");
    assert.equal(result.payment.archivedAt, "2026-09-30T12:00:00.000Z");
  } finally {
    adminPaymentsRepository.findPayment = originalFind;
    adminPaymentsRepository.transaction = originalTransaction;
  }
});

test("lista principal e arquivo usam filtros separados sem remover pagamentos", async () => {
  const originalList = adminPaymentsRepository.list;
  const originalCount = adminPaymentsRepository.count;
  const seen = [];
  adminPaymentsRepository.list = async ({ where }) => { seen.push(where.arquivado_admin_em); return []; };
  adminPaymentsRepository.count = async () => 0;
  try {
    await listAdminPayments();
    await listAdminPayments({ archived: true });
    assert.equal(seen[0], null);
    assert.deepEqual(seen[1], { not: null });
  } finally {
    adminPaymentsRepository.list = originalList;
    adminPaymentsRepository.count = originalCount;
  }
});

test("cancelamento de Pix misto devolve apenas a parcela confirmada da carteira", async () => {
  const entries = [];
  let updatedStatus = null;
  const database = {
    pagamentoComposicao: {
      findMany: async () => [
        { carteira_id: 10, tipo_origem: "SALDO", status: "CONFIRMADO", valor_centavos: 2000n },
        { carteira_id: null, tipo_origem: "PIX", status: "CANCELADO", valor_centavos: 8000n },
      ],
      updateMany: async (args) => { updatedStatus = args.data.status; },
    },
    carteira: { update: async () => ({ saldo_disponivel_centavos: 5000n, usuario_id: 1 }) },
    lancamentoCarteira: { create: async ({ data }) => { entries.push(data); } },
  };
  const result = await restorePaymentWalletCompositions(database, { id: 42 }, {
    reason: "Pix cancelado no gateway",
  });
  assert.equal(result.restoredCents, 2000);
  assert.deepEqual(result.userIds, [1]);
  assert.equal(updatedStatus, "ESTORNADO");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].valor_centavos, 2000n);
});
