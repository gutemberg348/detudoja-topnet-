import assert from "node:assert/strict";
import test from "node:test";
import { createSicrediOAuthClient } from "../src/modules/payments/sicredi/sicredi.oauth.js";
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

test("configuration requires explicit sandbox Pix credentials and ignores application/Multipag values", () => {
  const old = { SICREDI_MULTIPAG_CLIENT_ID: "m-id", SICREDI_MULTIPAG_CLIENT_SECRET: "m-secret", SICREDI_PIX_CLIENT_ID: "p-id", SICREDI_PIX_CLIENT_SECRET: "p-secret", SICREDI_PIX_RECEIVING_KEY: "production-key", SICREDI_PIX_API_URL: "https://api-pix.sicredi.com.br/api/v2" };
  const env = { ...old, SICREDI_PIX_TEST_ENV: "sandbox", SICREDI_PIX_TEST_CLIENT_ID: "t-id", SICREDI_PIX_TEST_CLIENT_SECRET: "t-secret" };
  assert.equal(testConfig(env).credentialSource, "SICREDI_PIX_TEST");
  assert.equal(testConfig(env).apiUrl, SANDBOX.apiUrl);
  assert.equal(testConfig(env).clientId, "t-id");
  assert.equal(testConfig(env).clientSecret, "t-secret");
  assert.throws(() => testConfig({ ...old, SICREDI_PIX_TEST_ENV: "sandbox" }), /novo par/);
  assert.throws(() => testConfig({ ...env, SICREDI_PIX_TEST_CLIENT_SECRET: "" }), /novo par/);
  for (const environment of [undefined, "production", ""]) {
    assert.throws(() => testConfig({ ...env, SICREDI_PIX_TEST_ENV: environment }), /SICREDI_PIX_TEST_ENV=sandbox/);
  }
  assert.equal(testConfig({ ...env, SICREDI_MULTIPAG_TEST_DESTINATION_KEY: "destination" }).pixKey, "");
});

test("CLI restricts actions/scopes and uses unique test TXIDs", () => {
  assert.equal(parseCommand([]).mode, "diagnostico");
  assert.equal(parseCommand(["autenticar"]).scope, "cob.write");
  assert.equal(parseCommand(["autenticar", "cob.read+cob.write+pix.read cob.read"]).scope, "cob.read cob.write pix.read");
  assert.equal(parseCommand(["autenticar", "webhook.read"]).scope, "webhook.read");
  assert.match(parseCommand(["criar"]).txid, /^DTJTEST[a-zA-Z0-9]{19,28}$/);
  assert.notEqual(parseCommand(["criar"]).txid, parseCommand(["criar"]).txid);
  for (const args of [["enviar"], ["consultar"], ["criar", "../../x"], ["autenticar", "pix.write"], ["autenticar", ""], ["autenticar", "cob.read multipag.pix.pagar"], ["diagnostico", "extra"]]) {
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
  assert.deepEqual(m.calls[1].body.valor, { original: "1.00", modalidadeAlteracao: 0 });
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

test("combined scopes follow the guide's Basic and form protocol without exposing the token", async () => {
  const calls = [], logs = [];
  const agent = { destroy() {} };
  await runSandbox(parseCommand(["autenticar", "cob.read+cob.write+pix.read"]), config, {
    log: (...args) => logs.push(args), mtlsLoader: async () => agent,
    oauthFactory: (settings, dependencies) => createSicrediOAuthClient(settings, {
      ...dependencies,
      httpRequest: async (url, options) => {
        calls.push({ url: String(url), ...options });
        return { statusCode: 200, data: { access_token: "private-token", expires_in: 3599 } };
      },
    }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SANDBOX.tokenUrl);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].agent, agent);
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`);
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("scope"), "cob.read cob.write pix.read");
  assert.equal(form.has("client_secret"), false);
  assert.doesNotMatch(JSON.stringify(logs), /test-client|test-secret|private-token/);
});

test("consultation summarizes receipts without logging payer details", async () => {
  const m = mock({ get: async () => ({ ...charge, status: "CONCLUIDA", pix: [{
    valor: "1.00", horario: "2026-10-23T12:00:00Z", pagador: { nome: "PRIVATE-PAYER", cpf: "PRIVATE-DOC" },
  }] }) });
  await runSandbox({ mode: "consultar", txid }, config, m.dependencies);
  const summary = m.logs.find(([label]) => label.includes("Recebimentos"))[1];
  assert.equal(summary.quantidade, 1);
  assert.deepEqual(summary.recebimentos, [{ valor: "1.00", horario: "2026-10-23T12:00:00Z" }]);
  assert.doesNotMatch(JSON.stringify(m.logs), /PRIVATE-PAYER|PRIVATE-DOC/);
  assert.deepEqual(m.calls.map((call) => call.method), ["GET"]);
});
