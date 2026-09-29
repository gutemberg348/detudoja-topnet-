import assert from "node:assert/strict";
import test from "node:test";
import { createSicrediOAuthClient } from "../src/modules/payments/sicredi/sicredi.oauth.js";
import { assertSicrediSuccess, decodeSicrediResponse, sicrediErrorDiagnostics } from "../src/modules/payments/sicredi/sicredi.transport.js";
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

test("diagnostico preserva mensagem do banco sem expor credenciais ou corpo bruto", () => {
  const details = sicrediErrorDiagnostics({
    code: "PIX_INVALIDO",
    message: "Erro com segredoXYZ e teste@example.com, documento 11111111000111, Bearer abc.123.sig",
    client_secret: "nao-mostrar",
    access_token: "nao-mostrar-token",
    errors: [{ codigo: "CAMPO_INVALIDO", mensagem: "Conta 000001 invalida" }],
  }, ["segredoXYZ", "000001"]);
  const text = JSON.stringify(details);
  for (const value of ["segredoXYZ", "000001", "teste@example.com", "11111111000111", "abc.123.sig", "nao-mostrar"]) {
    assert.equal(text.includes(value), false, value);
  }
  assert.match(text, /PIX_INVALIDO/);
  assert.match(text, /CAMPO_INVALIDO/);
  const html = sicrediErrorDiagnostics("<html>segredoXYZ</html>", ["segredoXYZ"]);
  assert.equal(JSON.stringify(html).includes("segredoXYZ"), false);
});

test("diagnostico aceita arrays de mensagens, validacoes aninhadas e campos em portugues", () => {
  const details = sicrediErrorDiagnostics({
    resposta: { validacoes: [{ campo: "dataPagamento", descricao: "Data anterior ao dia atual" }] },
    errors: ["Campo obrigatorio", { defaultMessage: "Formato invalido" }],
    mensagemErro: "Pagamento invalido",
    request: { message: "conteudo sensivel da requisicao" },
    rejectedValue: { message: "valor sensivel" },
  });
  const text = JSON.stringify(details);
  for (const value of ["dataPagamento", "Data anterior", "Campo obrigatorio", "Formato invalido", "Pagamento invalido"]) assert.ok(text.includes(value));
  assert.equal(text.includes("sensivel"), false);
  assert.match(JSON.stringify(sicrediErrorDiagnostics(["Erro de validacao"])), /Erro de validacao/);
});

test("resposta 400 texto ou HTML conserva diagnostico sanitizado e metadados", () => {
  const raw = '<html><h1>Bad Request</h1><p>Data invalida token-secreto</p></html>';
  const response = decodeSicrediResponse(raw, 400, "text/html");
  assert.equal(response.data, null);
  assert.equal(response.responseInfo.format, "text");
  assert.equal(response.responseInfo.bytes, Buffer.byteLength(raw));
  assert.throws(() => assertSicrediSuccess(response, "a operacao", { sensitiveValues: ["token-secreto"] }), (error) => {
    assert.match(JSON.stringify(error.providerDiagnostics), /Data invalida/);
    assert.equal(JSON.stringify(error).includes("token-secreto"), false);
    assert.equal(error.providerResponseInfo.contentType, "text/html");
    return true;
  });
  assert.equal(decodeSicrediResponse("", 400).responseInfo.format, "empty");
  assert.equal(decodeSicrediResponse('{"message":"Erro"}', 400).responseInfo.format, "json");
  assert.equal(decodeSicrediResponse("texto", 200).errorText, undefined);
});

test("erro HTTP registra metodo e endpoint corretos sem vazar segredo ecoado pelo banco", async () => {
  const client = createSicrediOAuthClient({
    apiUrl: "https://sicredi.test/multipag",
    tokenUrl: "https://sicredi.test/auth/token",
    clientId: "cliente-teste", clientSecret: "segredo-teste",
    scope: "multipag.pix.consultar", tokenStyle: "body", mtls: {},
  }, {
    mtlsLoader: async () => ({}),
    httpRequest: async (url) => String(url).endsWith("/auth/token")
      ? { statusCode: 200, data: { access_token: "token-teste", expires_in: 300 } }
      : { statusCode: 500, data: { message: "Falha interna segredo-teste token-teste" } },
  });
  await assert.rejects(client.request("/v1/pagamentos/pix/TESTE1"), (error) => {
    assert.equal(error.providerMethod, "GET");
    assert.equal(error.providerPath, "/multipag/v1/pagamentos/pix/TESTE1");
    assert.equal(error.providerStage, "operacao");
    assert.equal(error.providerStatusCode, 500);
    assert.equal(error.providerStateUnknown, true);
    assert.equal(JSON.stringify(error.providerDiagnostics).includes("segredo-teste"), false);
    assert.equal(JSON.stringify(error.providerDiagnostics).includes("token-teste"), false);
    return true;
  });
});
