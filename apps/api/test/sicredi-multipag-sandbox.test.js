import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMultipagSandboxConfig,
  runMultipagSandboxTransfer,
  runMultipagSandboxExample,
} from "../src/modules/payments/sicredi/sicredi.multipag.sandbox.js";
import { createSicrediMultipagClient } from "../src/modules/payments/sicredi/sicredi.multipag.client.js";

const config = {
  apiUrl: "https://mtls-api-parceiro.sicredi.com.br/sb/multipag-pagamento-sandbox",
  tokenUrl: "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token",
};
const transfer = { transactionId: "TESTE-PIX-1" };

test("POST do exemplo usa exatamente os dados oficiais e ignora conta real do env", async () => {
  const calls = [];
  const result = await runMultipagSandboxExample({
    config: { ...config, conta: "123456", cooperativa: "9999", documento: "22222222000122" },
    environment: "sandbox", confirmation: "CONFIRMO_SANDBOX",
  }, {
    clientFactory: (settings) => createSicrediMultipagClient(settings, {
      oauthFactory: (oauthConfig) => ({ request: async (path, options) => {
        calls.push({ scope: oauthConfig.scope, path, ...options });
        return { idTransacao: "0910F3HT1", status: "RECEBIDO", valorPagamento: 20.1 };
      } }),
    }),
  });
  assert.deepEqual(calls, [{
    scope: "multipag.pix.pagar", path: "/v1/pagamentos/pix/chave", method: "POST",
    body: {
      conta: "000001", cooperativa: "0100", documento: "11111111000111",
      chavePix: "+5511999999999", documentoBeneficiario: "11111111111",
      dataPagamento: "2026-08-14", valorPagamento: 20.1,
      identificadorPagamentoAssociado: "EMP:001", mensagemPix: "Pagamento ordem 001", idTransacao: "0910F3HT1",
    },
  }]);
  assert.equal(result.action, "exemplo_estatico_enviado");
});

test("exemplo estatico exige confirmacao e bloqueia URLs de producao antes de criar cliente", async () => {
  const dependencies = { clientFactory: () => { assert.fail("Nao deve instanciar cliente"); } };
  await assert.rejects(runMultipagSandboxExample({ config, environment: "sandbox" }, dependencies), /CONFIRMO_SANDBOX/);
  await assert.rejects(runMultipagSandboxExample({ config, environment: "production", confirmation: "CONFIRMO_SANDBOX" }, dependencies), /somente nos endpoints oficiais/);
  await assert.rejects(runMultipagSandboxExample({
    config: { ...config, apiUrl: "https://mtls-api-parceiro.sicredi.com.br/multipag" },
    environment: "sandbox", confirmation: "CONFIRMO_SANDBOX",
  }, dependencies), /somente nos endpoints oficiais/);
});

test("falha do exemplo identifica POST e nunca repete automaticamente", async () => {
  let attempts = 0;
  const failure = Object.assign(new Error("HTTP 500"), { providerStateUnknown: true });
  await assert.rejects(runMultipagSandboxExample({ config, environment: "sandbox", confirmation: "CONFIRMO_SANDBOX" }, {
    clientFactory: () => ({ createPixTransfer: async () => { attempts++; throw failure; } }),
  }), /HTTP 500/);
  assert.equal(attempts, 1);
  assert.equal(failure.testStage, "criacao_exemplo_estatico");
});

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
  assert.equal(failure.testStage, "consulta_previa");
});

test("404 da autenticacao nao e confundido com ausencia de pagamento", async () => {
  let sent = false;
  const failure = Object.assign(new Error("auth 404"), { providerStatusCode: 404, providerStage: "autenticacao" });
  await assert.rejects(runMultipagSandboxTransfer({ config, environment: "sandbox", mode: "enviar", transactionId: "TESTE-PIX-1", transfer }, {
    clientFactory: () => ({
      getPixTransfer: async () => { throw failure; },
      createPixTransfer: async () => { sent = true; },
    }),
  }), /auth 404/);
  assert.equal(sent, false);
});

test("500 do POST identifica a etapa e nao repete o envio", async () => {
  let sent = 0;
  const events = [];
  const failure = Object.assign(new Error("HTTP 500"), { providerStatusCode: 500, providerStateUnknown: true });
  await assert.rejects(runMultipagSandboxTransfer({ config, environment: "sandbox", mode: "enviar", transactionId: "TESTE-PIX-1", transfer }, {
    onProgress: (event) => events.push(event.stage),
    clientFactory: () => ({
      getPixTransfer: async () => { throw Object.assign(new Error("404"), { providerStatusCode: 404 }); },
      createPixTransfer: async () => { sent += 1; throw failure; },
    }),
  }), /HTTP 500/);
  assert.equal(sent, 1);
  assert.equal(failure.testStage, "criacao");
  assert.deepEqual(events, ["consulta_previa", "consulta_previa_404", "criacao"]);
});
