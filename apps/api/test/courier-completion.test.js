import assert from "node:assert/strict";
import { test } from "node:test";
import { completePaidCourierRide, isCourierConversation, shouldCompletePaidCourierRide } from "../src/modules/service-chats/courier-completion.js";
import { releaseCommercialSettlement } from "../src/modules/earnings/earnings-release.service.js";

const motoboy = { servico_vendedor: { tipo_servico: { tipo_operacao: "ENTREGA_LOCAL" } } };

test("only direct motoboy rides use the no-code completion flow", () => {
  assert.equal(isCourierConversation(motoboy), true);
  assert.equal(isCourierConversation({ ...motoboy, loja_solicitante_id: 4 }), false);
  assert.equal(isCourierConversation({ ...motoboy, pedido_loja_id: 8 }), false);
  assert.equal(isCourierConversation({ servico_vendedor: { tipo_servico: { tipo_operacao: "OUTRO" } } }), false);
  assert.equal(isCourierConversation({ solicitacao_motoboy: { id: 17 }, servico_vendedor: { tipo_servico: { tipo_operacao: "GERAL" } } }), true);
  assert.equal(isCourierConversation({ solicitacao_motoboy: { id: 17 }, loja_solicitante_id: 4 }), false);
});

test("QR payment completes only a motoboy ride already finished by the rider", () => {
  assert.equal(shouldCompletePaidCourierRide({ ...motoboy, status: "AGUARDANDO_CONFIRMACAO" }, "QR_PRESENCIAL"), true);
  assert.equal(shouldCompletePaidCourierRide({ ...motoboy, status: "ACORDADA" }, "QR_PRESENCIAL"), false);
  assert.equal(shouldCompletePaidCourierRide({ ...motoboy, status: "AGUARDANDO_CONFIRMACAO" }, "ONLINE"), false);
  assert.equal(shouldCompletePaidCourierRide({ ...motoboy, loja_solicitante_id: 4, status: "AGUARDANDO_CONFIRMACAO" }, "QR_PRESENCIAL"), false);
  assert.equal(shouldCompletePaidCourierRide({ solicitacao_motoboy: { id: 17 }, status: "AGUARDANDO_CONFIRMACAO" }, "QR_PRESENCIAL"), true);
});

test("a paid ride closes its proposal and courier request before settling earnings", async () => {
  const calls = [];
  const database = {
    conversaServico: { updateMany: async (args) => { calls.push(["ride", args]); return { count: 1 }; } },
    propostaServico: { updateMany: async (args) => { calls.push(["proposal", args]); return { count: 1 }; } },
    solicitacaoMotoboy: { updateMany: async (args) => { calls.push(["request", args]); return { count: 1 }; } },
    conversaServicoMensagem: { create: async (args) => { calls.push(["message", args]); return {}; } },
    cobranca: { findUnique: async () => ({
      status: "PAGA", pagamento_id: 101, pagamento: { status: "PAGO" }, vendedor: { id: 3 },
    }) },
    transacaoComercial: { findUnique: async () => ({ id: 9, status: "LIQUIDADA" }) },
  };
  const result = await completePaidCourierRide(database, {
    actorUserId: 5, chargeId: 7, conversationId: 3, expectedStatus: "ACORDADA", proposalId: 6,
  });
  assert.deepEqual(calls.map(([type]) => type), ["ride", "proposal", "request", "message"]);
  assert.equal(calls[0][1].data.status, "ENCERRADA");
  assert.equal(calls[0][1].where.status, "ACORDADA");
  assert.equal(calls[1][1].data.status, "CONCLUIDA");
  assert.equal(calls[2][1].data.status, "CONCLUIDA");
  assert.equal(result.transactionId, 9);
});

test("a previously paid ride awaiting an old customer confirmation can be finished by the rider", async () => {
  const statuses = [];
  const database = {
    conversaServico: { updateMany: async ({ where }) => { statuses.push(where.status); return { count: 1 }; } },
    propostaServico: { updateMany: async () => ({ count: 1 }) },
    solicitacaoMotoboy: { updateMany: async () => ({ count: 1 }) },
    conversaServicoMensagem: { create: async () => ({}) },
    cobranca: { findUnique: async () => ({
      status: "PAGA", pagamento_id: 101, pagamento: { status: "PAGO" }, vendedor: { id: 3 },
    }) },
    transacaoComercial: { findUnique: async () => ({ id: 9, status: "LIQUIDADA" }) },
  };
  await completePaidCourierRide(database, {
    actorUserId: 5, chargeId: 7, conversationId: 3,
    expectedStatus: "AGUARDANDO_CONFIRMACAO", proposalId: 6,
  });
  assert.deepEqual(statuses, ["AGUARDANDO_CONFIRMACAO"]);
});

test("a customer dispute blocks release even after the ride was marked completed", async () => {
  const database = {
    $queryRaw: async () => [{ locked: "" }],
    transacaoComercial: { findUnique: async () => ({
      id: 9,
      status: "VALIDADA",
      validada_em: new Date("2026-09-01T00:00:00Z"),
      pagamento: {
        status: "PAGO",
        cobranca: { proposta_servico: {
          concluido_em: new Date("2026-09-01T00:00:00Z"),
          status: "CONCLUIDA",
          conversa_servico: { status: "EM_DISPUTA" },
        } },
      },
    }) },
  };
  const result = await releaseCommercialSettlement(database, 9, { now: new Date("2026-09-03T00:00:00Z") });
  assert.equal(result.released, false);
});
