import assert from "node:assert/strict";
import test from "node:test";
import { createSicrediOAuthClient } from "../src/modules/payments/sicredi/sicredi.oauth.js";
import {
  createSicrediPixClient,
  sicrediTxidForPayment,
} from "../src/modules/payments/sicredi/sicredi.pix.client.js";
import {
  createSicrediMultipagClient,
  sicrediPixKeyForTransfer,
} from "../src/modules/payments/sicredi/sicredi.multipag.client.js";

function fakeOAuth() {
  const calls = [];
  const factory = (config) => ({
    request: async (path, options) => {
      calls.push({ config, options, path });
      return { status: "RECEBIDO" };
    },
  });
  return { calls, factory };
}

test("Pix recebimento monta cobranca com valor travado e txid estavel", async () => {
  const mock = fakeOAuth();
  const client = createSicrediPixClient({ pixKey: "chave-teste" }, { oauthFactory: mock.factory });
  const id = sicrediTxidForPayment(42);
  assert.equal(id.length, 31);
  assert.equal(id, sicrediTxidForPayment(42));
  await client.createCharge({ amountCents: 11869, description: "Pedido 42", id });
  assert.equal(mock.calls[0].config.scope, "cob.write");
  assert.equal(mock.calls[0].options.method, "PUT");
  assert.equal(mock.calls[0].path, `/cob/${id}`);
  assert.deepEqual(mock.calls[0].options.body.valor, {
    modalidadeAlteracao: "0",
    original: "118.69",
  });
  await client.getCharge(id);
  assert.equal(mock.calls[1].config.scope, "cob.read");
  await client.cancelCharge(id);
  assert.equal(mock.calls[2].options.body.status, "REMOVIDA_PELO_USUARIO_RECEBEDOR");
});

test("Pix recebimento exige E2E para devolucao e preserva centavos", async () => {
  const mock = fakeOAuth();
  const client = createSicrediPixClient({ pixKey: "chave-teste" }, { oauthFactory: mock.factory });
  assert.throws(() => client.requestRefund({ amountCents: 1, e2eId: "errado", refundId: "R1" }));
  const e2eId = "A".repeat(32);
  await client.requestRefund({ amountCents: 105, e2eId, refundId: "R1" });
  assert.equal(mock.calls[0].config.scope, "pix.write");
  assert.equal(mock.calls[0].options.body.valor, "1.05");
  assert.equal(mock.calls[0].path, `/pix/${e2eId}/devolucao/R1`);
});

test("Multipag nao envia transferencias sem habilitacao explicita", async () => {
  const client = createSicrediMultipagClient({}, { oauthFactory: fakeOAuth().factory });
  await assert.rejects(client.createPixTransfer({}), /nao habilitado/);
});

test("Multipag formata chave telefone e cria Pix com idTransacao persistivel", async () => {
  const mock = fakeOAuth();
  const client = createSicrediMultipagClient({
    conta: "000001",
    cooperativa: "0100",
    documento: "11111111000111",
    transferEnabled: true,
  }, { oauthFactory: mock.factory });
  assert.equal(sicrediPixKeyForTransfer("TELEFONE", "11999999999"), "+5511999999999");
  await client.createPixTransfer({
    amountCents: 5001,
    date: "2026-09-28",
    destinationDocument: "11111111111",
    destinationKey: "11999999999",
    destinationKeyType: "TELEFONE",
    destinationName: "Pessoa Teste",
    transactionId: "DTJ-SAQUE-42",
  });
  assert.equal(mock.calls[0].config.scope, "multipag.pix.pagar");
  assert.equal(mock.calls[0].path, "/v1/pagamentos/pix/chave");
  assert.equal(mock.calls[0].options.body.valorPagamento, 50.01);
  assert.equal(mock.calls[0].options.body.chavePix, "+5511999999999");
  await client.getPixTransfer("DTJ-SAQUE-42");
  assert.equal(mock.calls[1].config.scope, "multipag.pix.consultar");
  assert.equal(mock.calls[1].options.headers["x-documento"], "11111111000111");
});

test("OAuth Sicredi guarda token e nao repete mutacao apos 401", async () => {
  const calls = [];
  const client = createSicrediOAuthClient({
    apiUrl: "https://sicredi.test/api/v2",
    clientId: "id",
    clientSecret: "secret",
    mtls: {},
    scope: "cob.write",
    tokenStyle: "basic",
    tokenUrl: "https://sicredi.test/oauth/token",
  }, {
    httpRequest: async (url, options) => {
      calls.push({ options, url: String(url) });
      if (String(url).endsWith("/oauth/token")) {
        return { data: { access_token: "token", expires_in: 300 }, statusCode: 200 };
      }
      return { data: { error: "unauthorized" }, statusCode: 401 };
    },
    mtlsLoader: async () => ({}),
  });
  await assert.rejects(client.request("/cob/ABC", { body: {}, method: "PUT" }));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization.startsWith("Basic "), true);
  assert.equal(calls[1].options.headers.Authorization, "Bearer token");
});
