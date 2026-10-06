import assert from "node:assert/strict";
import test from "node:test";
import { servicePaymentStatus } from "../src/modules/service-chats/service-payment-status.js";

const start = new Date("2026-10-06T12:00:00Z");
const proposal = {
  valor_centavos: 1000n, status: "CONCLUIDA", forma_pagamento: "ONLINE",
  cobranca: { pagamento: { status: "PAGO", transacao_comercial: {
    status: "VALIDADA", validada_em: start, valor_liquido_lojista_centavos: 900n, taxa_plataforma_centavos: 100n,
  } } },
};

test("prazo financeiro usa a validacao persistida, sem depender de mensagens ou confirmacao", () => {
  const result = servicePaymentStatus(proposal, "ENCERRADA", { now: start, isSeller: true });
  assert.equal(result.availableAt, "2026-10-07T12:00:00.000Z");
  assert.equal(result.canDispute, true);
  assert.equal(result.netCents, 900);
  assert.equal(result.feeCents, 100);
  assert.equal(result.destination, "SALES_WALLET");
  assert.equal(servicePaymentStatus(proposal, "ENCERRADA", { now: new Date(result.availableAt) }).canDispute, false);
});

test("cliente nao recebe informacoes financeiras privadas do prestador", () => {
  const result = servicePaymentStatus(proposal, "ENCERRADA", { now: start });
  assert.equal(result.netCents, undefined);
  assert.equal(result.payoutStatus, undefined);
  assert.equal(result.grossCents, 1000);
});

test("disputa, estorno e pagamento ainda nao confirmado nao prometem liberacao", () => {
  assert.equal(servicePaymentStatus(proposal, "EM_DISPUTA").automaticRelease, false);
  assert.equal(servicePaymentStatus(proposal, "EM_DISPUTA").canDispute, false);
  const refunded = structuredClone(proposal);
  refunded.cobranca.pagamento.status = "ESTORNADO";
  assert.equal(servicePaymentStatus(refunded, "ENCERRADA").state, "REFUNDED");
  refunded.cobranca.pagamento.status = "PENDENTE";
  assert.equal(servicePaymentStatus(refunded, "ACORDADA"), null);
});
