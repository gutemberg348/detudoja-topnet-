import assert from "node:assert/strict";
import test from "node:test";
import { errorSummary, parseCommand, runSandbox, SANDBOX, testConfig } from "../scripts/sicredi-pix-sandbox.js";

const txid = "DTJTEST123456789012345678901234";
const charge = { txid, status: "ATIVA", valor: { original: "1.00" }, pixCopiaECola: "sandbox-brcode" };
const config = {
  ...SANDBOX, clientId: "test-client", clientSecret: "test-secret", credentialSource: "SICREDI_PIX_TEST",
  pixKey: "sandbox-receiving-key", mtls: {},
};
function providerError(status, stage = "operacao") {
  return Object.assign(new Error(`HTTP ${status}`), { providerStatusCode: status, providerStage: stage });
}
function mock({ get = async () => charge, put = async () => charge } = {}) {
  const calls = [], logs = [];
  let destroyed = 0, loaded = 0;
  return {
    calls, logs,
    get destroyed() { return destroyed; },
    get loaded() { return loaded; },
    dependencies: {
      log: (...args) => logs.push(args),
      mtlsLoader: async () => { loaded++; return { destroy() { destroyed++; } }; },
      oauthFactory: (settings) => ({
        accessToken: async () => { calls.push({ method: "TOKEN", settings }); return "NEVER-PRINT-TOKEN"; },
        request: async (path, options = {}) => {
          const call = { settings, method: options.method || "GET", path, body: options.body };
          calls.push(call);
          return call.method === "GET" ? get(call) : put(call);
        },
      }),
    },
  };
}

test("configuration chooses whole credential pairs and never inherits production endpoints", () => {
  const env = { SICREDI_MULTIPAG_CLIENT_ID: "m-id", SICREDI_MULTIPAG_CLIENT_SECRET: "m-secret", SICREDI_PIX_API_URL: "https://api-pix.sicredi.com.br/api/v2" };
  assert.equal(testConfig(env).credentialSource, "SICREDI_MULTIPAG");
  assert.equal(testConfig(env).apiUrl, SANDBOX.apiUrl);
  assert.equal(testConfig({ ...env, SICREDI_PIX_CLIENT_ID: "p-id", SICREDI_PIX_CLIENT_SECRET: "p-secret" }).credentialSource, "SICREDI_PIX");
  assert.equal(testConfig({ ...env, SICREDI_PIX_TEST_CLIENT_ID: "t-id", SICREDI_PIX_TEST_CLIENT_SECRET: "t-secret" }).credentialSource, "SICREDI_PIX_TEST");
  assert.throws(() => testConfig({ ...env, SICREDI_PIX_CLIENT_ID: "partial" }), /Pares nao sao misturados/);
  assert.throws(() => testConfig({ ...env, SICREDI_MULTIPAG_ENV: "production" }), /fora do sandbox/);
  assert.equal(testConfig({ ...env, SICREDI_MULTIPAG_TEST_DESTINATION_KEY: "destination" }).pixKey, "");
});

test("CLI restricts actions/scopes and uses unique test TXIDs", () => {
  assert.equal(parseCommand([]).mode, "diagnostico");
  assert.equal(parseCommand(["autenticar"]).scope, "cob.write");
  assert.match(parseCommand(["criar"]).txid, /^DTJTEST[a-zA-Z0-9]{19,28}$/);
  assert.notEqual(parseCommand(["criar"]).txid, parseCommand(["criar"]).txid);
  for (const args of [["enviar"], ["consultar"], ["criar", "../../x"], ["autenticar", "pix.write"], ["diagnostico", "extra"]]) {
    assert.throws(() => parseCommand(args));
  }
});

test("local diagnostic checks certificates without network and closes the agent", async () => {
  const m = mock();
  await runSandbox({ mode: "diagnostico" }, config, m.dependencies);
  assert.equal(m.loaded, 1); assert.equal(m.destroyed, 1); assert.equal(m.calls.length, 0);
});

test("authentication requests Pix write scope with Basic auth and hides credentials/token", async () => {
  const m = mock();
  await runSandbox({ mode: "autenticar" }, config, m.dependencies);
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].settings.scope, "cob.write");
  assert.equal(m.calls[0].settings.tokenStyle, "basic");
  assert.doesNotMatch(JSON.stringify(m.logs), /test-secret|test-client|NEVER-PRINT-TOKEN/);
  assert.equal(m.destroyed, 1);
});

test("creation uses one PUT for absent TXID and displays bank-provided copia e cola", async () => {
  const m = mock({ get: async () => { throw providerError(404); } });
  await runSandbox({ mode: "criar", txid }, config, m.dependencies);
  assert.deepEqual(m.calls.map((c) => c.method), ["GET", "PUT"]);
  assert.equal(m.calls[1].path, `/cob/${txid}`);
  assert.equal(m.calls[1].settings.scope, "cob.write");
  assert.deepEqual(m.calls[1].body.valor, { original: "1.00", modalidadeAlteracao: "0" });
  assert.equal(m.calls[1].body.calendario.expiracao, 3600);
  assert.equal(m.calls[1].body.chave, config.pixKey);
  assert.match(JSON.stringify(m.logs), /sandbox-brcode/);
  assert.equal(m.destroyed, 1);
});

test("repeating the same TXID consults an existing charge without overwriting it", async () => {
  for (const mode of ["criar", "consultar"]) {
    const m = mock();
    await runSandbox({ mode, txid }, config, m.dependencies);
    assert.deepEqual(m.calls.map((c) => c.method), ["GET"]);
  }
});

test("auth 404, forbidden and timeout do not trigger creation", async () => {
  for (const error of [providerError(404, "autenticacao"), providerError(403), providerError(500), new Error("timeout")]) {
    const m = mock({ get: async () => { throw error; } });
    await assert.rejects(runSandbox({ mode: "criar", txid }, config, m.dependencies));
    assert.deepEqual(m.calls.map((c) => c.method), ["GET"]);
    assert.equal(m.destroyed, 1);
  }
});

test("an uncertain PUT preserves TXID and is never retried", async () => {
  const m = mock({ get: async () => { throw providerError(404); }, put: async () => { throw providerError(500); } });
  await assert.rejects(runSandbox({ mode: "criar", txid }, config, m.dependencies), (error) => {
    assert.equal(error.testStage, "criacao"); assert.equal(error.testTxid, txid); return true;
  });
  assert.deepEqual(m.calls.map((c) => c.method), ["GET", "PUT"]);
  assert.equal(m.destroyed, 1);
});

test("missing receiving key and endpoints outside sandbox fail before network/cert loading", async () => {
  for (const bad of [{ ...config, pixKey: "" }, { ...config, apiUrl: "https://api-pix.sicredi.com.br/api/v2" }, { ...config, tokenUrl: "https://evil.example/token" }]) {
    const m = mock();
    await assert.rejects(runSandbox({ mode: "criar", txid }, bad, m.dependencies));
    assert.equal(m.loaded, 0); assert.equal(m.calls.length, 0);
  }
});

test("mismatched or empty charge responses are not reported as successful", async () => {
  for (const response of [null, {}, { ...charge, txid: "OTHER" }]) {
    const m = mock({ get: async () => response });
    await assert.rejects(runSandbox({ mode: "consultar", txid }, config, m.dependencies), /sem cobranca valida/);
    assert.equal(m.destroyed, 1);
  }
});

test("bank diagnostics remain useful without echoed secrets", () => {
  const summary = errorSummary(Object.assign(new Error(`failed ${config.clientSecret}`), {
    providerStatusCode: 401,
    providerDiagnostics: [{ field: "error_description", value: `invalid_client ${config.clientId} ${config.clientSecret}` }],
  }), config);
  assert.equal(summary.status, 401);
  assert.match(JSON.stringify(summary), /invalid_client/);
  assert.doesNotMatch(JSON.stringify(summary), /test-client|test-secret/);
});
