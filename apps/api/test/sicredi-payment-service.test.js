import assert from "node:assert/strict";
import { test } from "node:test";
import { createSicrediPaymentService } from "../src/modules/payments/sicredi/sicredi.payment.service.js";
import { sicrediTxidForPayment } from "../src/modules/payments/sicredi/sicredi.pix.client.js";

function fixture(overrides = {}) {
  let state = { id: 7, usuario_pagador_id: 3, gateway: "SICREDI", gateway_ambiente: "sandbox",
    gateway_pagamento_id: null, gateway_dados_json: null, status: "AGUARDANDO_PAGAMENTO",
    valor_pago_pix_centavos: 2010n, deposito_carteira: null, ...overrides };
  const events = [];
  const calls = [];
  let charge = { txid: sicrediTxidForPayment(7), chave: "key", valor: { original: "20.10" }, status: "ATIVA",
    pixCopiaECola: "test-pix-payload", calendario: { criacao: "2026-09-29T12:00:00Z", expiracao: 3600 } };
  const receipt = { txid: charge.txid, endToEndId: "E".repeat(32), valor: "20.10" };
  const repository = {
    async findPayment() { return structuredClone(state); },
    async updatePayment({ data }) { Object.assign(state, data); return structuredClone(state); },
    async updatePayments({ where, data }) {
      for (const [key, value] of Object.entries(where)) {
        if (typeof value === "object" && value?.in) { if (!value.in.includes(state[key])) return { count: 0 }; }
        else if (state[key] !== value) return { count: 0 };
      }
      Object.assign(state, data); return { count: 1 };
    },
  };
  const pixClient = {
    async createCharge(data) {
      assert.equal(state.status, "EM_RECONCILIACAO");
      assert.equal(state.gateway_pagamento_id, data.id);
      calls.push(data); return charge;
    },
    async getCharge() { return charge; },
    async getReceivedPix() { return receipt; },
    async requestRefund(data) { calls.push(data); return { id: data.refundId, valor: "20.10", status: "EM_PROCESSAMENTO" }; },
    async getRefund(data) { return { id: data.refundId, valor: "20.10", status: "DEVOLVIDO" }; },
    async cancelCharge() { charge = { ...charge, status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }; },
  };
  const service = createSicrediPaymentService({ repository, pixClient, receivingKey: "key", assertEnvironment() {},
    async settleEvent(event, gateway) {
      assert.equal(gateway, "SICREDI"); events.push(event);
      state.status = { PAYMENT_RECEIVED: "PAGO", PAYMENT_REFUNDED: "ESTORNADO", PAYMENT_DELETED: "CANCELADO" }[event.event];
    },
  });
  return { service, repository, pixClient, calls, events, receipt, state: () => state, charge: () => charge,
    paid() { charge = { ...charge, status: "CONCLUIDA", pix: [{ endToEndId: receipt.endToEndId }] }; } };
}
const createArgs = { description: "Pedido teste", paymentId: 7, userId: 3 };
test("cria Pix uma unica vez, persistindo TXID antes do envio e gerando QR", async () => {
  const f = fixture();
  const [first] = await Promise.all([f.service.createPendingSicrediPix(createArgs), f.service.createPendingSicrediPix(createArgs)]);
  assert.equal(f.calls.length, 1);
  const current = await f.service.createPendingSicrediPix(createArgs);
  assert.equal(current.status, "AGUARDANDO_PAGAMENTO");
  assert.match(current.qrImageDataUrl, /^data:image\/png;base64,/);
  assert.equal(current.pixCopyPaste, "test-pix-payload");
  assert.equal(first.gateway, "SICREDI");
});
test("timeout nao cancela nem troca gateway; repete somente consulta", async () => {
  const f = fixture();
  f.pixClient.createCharge = async () => { f.calls.push("PUT"); throw Object.assign(new Error("timeout"), { providerStateUnknown: true }); };
  const pending = await f.service.createPendingSicrediPix(createArgs);
  assert.equal(pending.status, "EM_RECONCILIACAO");
  await f.service.createPendingSicrediPix(createArgs);
  assert.deepEqual(f.calls, ["PUT"]);
  await f.service.reconcileSicrediPayment(7);
  assert.equal(f.state().status, "AGUARDANDO_PAGAMENTO");
});
test("404 na consulta permanece desconhecido e nunca autoriza outro PUT", async () => {
  const f = fixture({ gateway_pagamento_id: sicrediTxidForPayment(7), status: "EM_RECONCILIACAO" });
  f.pixClient.getCharge = async () => { throw Object.assign(new Error("404"), { providerStatusCode: 404 }); };
  await assert.rejects(f.service.reconcileSicrediPayment(7));
  await f.service.createPendingSicrediPix(createArgs);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state().status, "EM_RECONCILIACAO");
});
test("resposta com TXID de fixture nao confirma nem mostra QR de outra compra", async () => {
  const f = fixture();
  f.pixClient.createCharge = async () => ({ ...f.charge(), txid: "fixture" });
  assert.equal((await f.service.createPendingSicrediPix(createArgs)).status, "EM_RECONCILIACAO");
  assert.equal(f.events.length, 0);
  assert.equal(f.state().qr_code, undefined);
});
test("confirmacao usa recebimento consultado, preserva E2E e emite evento estavel", async () => {
  const f = fixture();
  await f.service.createPendingSicrediPix(createArgs); f.paid();
  await f.service.reconcileSicrediPayment(7);
  await f.service.reconcileSicrediPayment(7);
  assert.equal(f.state().status, "PAGO");
  assert.equal(f.state().gateway_dados_json.e2eId, f.receipt.endToEndId);
  assert.equal(f.events[0].id, f.events[1].id);
});
test("valor divergente bloqueia liquidacao mesmo com CONCLUIDA", async () => {
  const f = fixture();
  await f.service.createPendingSicrediPix(createArgs); f.paid(); f.receipt.valor = "1.00";
  await assert.rejects(f.service.reconcileSicrediPayment(7), /nao corresponde/);
  assert.equal(f.events.length, 0);
});
test("estorno incerto permanece em disputa e consulta o mesmo refundId sem reenviar", async () => {
  const f = fixture({ gateway_pagamento_id: sicrediTxidForPayment(7), status: "PAGO", gateway_dados_json: { e2eId: "E".repeat(32) } });
  f.pixClient.requestRefund = async (data) => { f.calls.push(data); throw new Error("timeout"); };
  assert.equal((await f.service.requestSicrediRefund(7)).gatewayStatus, "RECONCILING");
  await assert.rejects(f.service.requestSicrediRefund(7), /novamente/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.state().status, "EM_DISPUTA");
  await f.service.reconcileSicrediPayment(7);
  assert.equal(f.state().status, "ESTORNADO");
  assert.equal(f.events[0].event, "PAYMENT_REFUNDED");
});
test("cancelamento em corrida com pagamento nao cancela localmente um Pix pago", async () => {
  const f = fixture();
  await f.service.createPendingSicrediPix(createArgs);
  f.pixClient.cancelCharge = async () => f.paid();
  await assert.rejects(f.service.cancelSicrediPayment(7), /Pagamento mudou/);
  assert.equal(f.state().status, "PAGO");
});
test("nao estorna deposito automaticamente nem permite outro usuario gerar Pix", async () => {
  const f = fixture({ status: "PAGO", deposito_carteira: { id: 1 } });
  await assert.rejects(f.service.requestSicrediRefund(7), /analise/);
  await assert.rejects(f.service.createPendingSicrediPix({ ...createArgs, userId: 4 }), /nao encontrado/);
  assert.equal(f.calls.length, 0);
});
