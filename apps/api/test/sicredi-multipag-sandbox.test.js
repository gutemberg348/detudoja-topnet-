import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMultipagSandboxConfig,
  runMultipagSandboxTransfer,
} from "../src/modules/payments/sicredi/sicredi.multipag.sandbox.js";

const config = {
  apiUrl: "https://mtls-api-parceiro.sicredi.com.br/sb/multipag-pagamento-sandbox",
  tokenUrl: "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token",
};
const transfer = { transactionId: "TESTE-PIX-1" };

test("teste de repasse recusa producao e endpoints alterados", () => {
  assert.throws(() => assertMultipagSandboxConfig(config, "production"), /somente nos endpoints oficiais/);
  assert.throws(() => assertMultipagSandboxConfig({ ...config, apiUrl: "https://mtls-api-parceiro.sicredi.com.br/multipag" }, "sandbox"), /somente nos endpoints oficiais/);
  assert.throws(() => assertMultipagSandboxConfig({ ...config, tokenUrl: "https://outro.example/oauth/token" }, "sandbox"), /somente nos endpoints oficiais/);
  assert.doesNotThrow(() => assertMultipagSandboxConfig(config, "sandbox"));
});

test("consulta usa o mesmo idTransacao e nao cria pagamento", async () => {
  const calls = [];
  const result = await runMultipagSandboxTransfer({ config, environment: "sandbox", mode: "consultar", transactionId: "TESTE-PIX-1" }, {
    clientFactory: () => ({
      getPixTransfer: async (id) => { calls.push(["get", id]); return { idTransacao: id, status: "SUCESSO" }; },
      createPixTransfer: async () => { calls.push(["post"]); },
    }),
  });
  assert.deepEqual(calls, [["get", "TESTE-PIX-1"]]);
  assert.equal(result.action, "consultado");
  assert.equal(result.data.status, "SUCESSO");
});

test("envio nao duplica pagamento ja existente", async () => {
  const calls = [];
  const result = await runMultipagSandboxTransfer({ config, environment: "sandbox", mode: "enviar", transactionId: "TESTE-PIX-1", transfer }, {
    clientFactory: () => ({
      getPixTransfer: async (id) => { calls.push(["get", id]); return { idTransacao: id, status: "RECEBIDO" }; },
      createPixTransfer: async () => { calls.push(["post"]); },
    }),
  });
  assert.deepEqual(calls, [["get", "TESTE-PIX-1"]]);
  assert.equal(result.action, "ja_existia_nao_reenviado");
});

test("envio so faz POST quando consulta previa retorna 404", async () => {
  const calls = [];
  const result = await runMultipagSandboxTransfer({ config, environment: "sandbox", mode: "enviar", transactionId: "TESTE-PIX-1", transfer }, {
    clientFactory: () => ({
      getPixTransfer: async () => {
        calls.push("get");
        throw Object.assign(new Error("not found"), { providerStatusCode: 404 });
      },
      createPixTransfer: async (body) => {
        calls.push("post");
        assert.equal(body.transactionId, "TESTE-PIX-1");
        return { idTransacao: "TESTE-PIX-1", status: "RECEBIDO", valorPagamento: 1 };
      },
    }),
  });
  assert.deepEqual(calls, ["get", "post"]);
  assert.equal(result.action, "solicitacao_enviada");
  assert.equal(result.data.status, "RECEBIDO");
});

test("falha ou timeout da consulta previa bloqueia POST", async () => {
  let sent = false;
  const failure = Object.assign(new Error("estado desconhecido"), { providerStateUnknown: true });
  await assert.rejects(runMultipagSandboxTransfer({ config, environment: "sandbox", mode: "enviar", transactionId: "TESTE-PIX-1", transfer }, {
    clientFactory: () => ({
      getPixTransfer: async () => { throw failure; },
      createPixTransfer: async () => { sent = true; },
    }),
  }), /estado desconhecido/);
  assert.equal(sent, false);
});
