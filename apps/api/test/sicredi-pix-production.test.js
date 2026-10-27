import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProductionCommand, PRODUCTION, productionConfig, runProduction } from '../scripts/sicredi-pix-production.js';

const txid = 'DTJPROD123456789012345678901234';
const charge = { txid, status: 'ATIVA', valor: { original: '1.00' }, pixCopiaECola: 'bank-provided-brcode' };
const config = { ...PRODUCTION, environment: 'production', clientId: 'test-client', clientSecret: 'private-secret', pixKey: 'private-receiving-key' };
const providerError = (status, stage = 'operacao') => Object.assign(new Error('provider error'), { providerStatusCode: status, providerStage: stage });

function mock({ get = async () => charge, put = async () => charge } = {}) {
  const calls = [], logs = [];
  let loaded = 0, destroyed = 0;
  return { calls, logs, get loaded() { return loaded; }, get destroyed() { return destroyed; }, dependencies: {
    log: (...args) => logs.push(args),
    agentLoader: async () => { loaded++; return { destroy() { destroyed++; } }; },
    oauthFactory: (settings) => ({ request: async (path, options = {}) => {
      const call = { scope: settings.scope, method: options.method || 'GET', path, body: options.body };
      calls.push(call);
      return call.method === 'GET' ? get(call) : put(call);
    } }),
  } };
}

test('production commands default to local diagnostic and separate sandbox/production TXIDs', () => {
  assert.deepEqual(parseProductionCommand([]), { mode: 'diagnostico' });
  const first = parseProductionCommand(['criar']).txid;
  assert.match(first, /^DTJPROD[A-Za-z0-9]{19,28}$/);
  assert.notEqual(first, parseProductionCommand(['criar']).txid);
  for (const args of [['consultar'], ['criar', 'DTJTEST123456789012345678901234'], ['consultar', '../../x'], ['diagnostico', txid], ['criar', txid, 'extra'], ['devolver']]) assert.throws(() => parseProductionCommand(args));
});

test('production config reads only isolated env and ignores application URLs and credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pix-production-env-'));
  try {
    const file = join(dir, 'production.env');
    const text = 'SICREDI_PIX_TEST_ENV=production\nSICREDI_PIX_TEST_CLIENT_ID=isolated-id\nSICREDI_PIX_TEST_CLIENT_SECRET=isolated-secret\nSICREDI_PIX_TEST_RECEIVING_KEY=receiving-key';
    writeFileSync(file, text);
    const actual = productionConfig({ SICREDI_PIX_TEST_ENV_FILE: file, SICREDI_PIX_API_URL: 'https://other.invalid', SICREDI_PIX_CLIENT_SECRET: 'wrong-secret' });
    assert.equal(actual.apiUrl, PRODUCTION.apiUrl);
    assert.equal(actual.clientSecret, 'isolated-secret');
    assert.equal(actual.pixKey, 'receiving-key');
    writeFileSync(file, text.replace('production', 'sandbox'));
    assert.throws(() => productionConfig({ SICREDI_PIX_TEST_ENV_FILE: file }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('local diagnostics do not request OAuth or send HTTP', async () => {
  const m = mock();
  await runProduction({ mode: 'diagnostico' }, config, m.dependencies);
  assert.equal(m.calls.length, 0); assert.equal(m.destroyed, 1);
});

test('missing receiving key or wrong endpoint fails before cert/network', async () => {
  for (const bad of [{ ...config, pixKey: '' }, { ...config, environment: 'sandbox' }, { ...config, tokenUrl: 'https://other.invalid' }, { ...config, apiUrl: 'https://other.invalid' }]) {
    const m = mock();
    await assert.rejects(runProduction({ mode: 'criar', txid }, bad, m.dependencies));
    assert.equal(m.loaded, 0); assert.equal(m.calls.length, 0);
  }
});

test('absent charge creates exactly one real one-real charge with fixed amount and expiration', async () => {
  const m = mock({ get: async () => { throw providerError(404); } });
  await runProduction({ mode: 'criar', txid }, config, m.dependencies);
  assert.deepEqual(m.calls.map((c) => c.method), ['GET', 'PUT']);
  assert.equal(m.calls[0].scope, 'cob.read');
  assert.equal(m.calls[1].scope, 'cob.write');
  assert.equal(m.calls[1].path, `/cob/${txid}`);
  assert.deepEqual(m.calls[1].body.valor, { original: '1.00', modalidadeAlteracao: '0' });
  assert.equal(m.calls[1].body.calendario.expiracao, 3600);
  assert.equal(m.calls[1].body.chave, config.pixKey);
  assert.match(JSON.stringify(m.logs), /bank-provided-brcode/);
  assert.doesNotMatch(JSON.stringify(m.logs), /private-secret|private-receiving-key|test-client/);
  assert.equal(m.destroyed, 1);
});

test('existing charge is only consulted; paid receipts omit payer data', async () => {
  for (const mode of ['criar', 'consultar']) {
    const m = mock({ get: async () => ({ ...charge, status: 'CONCLUIDA', pix: [{ valor: '1.00', horario: '2026-10-27T14:00:00Z', pagador: { nome: 'PRIVATE-PAYER' } }] }) });
    await runProduction({ mode, txid }, config, m.dependencies);
    assert.deepEqual(m.calls.map((c) => c.method), ['GET']);
    assert.match(JSON.stringify(m.logs), /CONCLUIDA/);
    assert.doesNotMatch(JSON.stringify(m.logs), /PRIVATE-PAYER/);
  }
});

test('authentication 404, denial, timeout and bank 500 never authorize a PUT', async () => {
  for (const error of [providerError(404, 'autenticacao'), providerError(403), providerError(500), new Error('timeout')]) {
    const m = mock({ get: async () => { throw error; } });
    await assert.rejects(runProduction({ mode: 'criar', txid }, config, m.dependencies));
    assert.deepEqual(m.calls.map((c) => c.method), ['GET']);
    assert.equal(m.destroyed, 1);
  }
});

test('uncertain PUT retains TXID with no retries and closes agent', async () => {
  const m = mock({ get: async () => { throw providerError(404); }, put: async () => { throw providerError(500); } });
  await assert.rejects(runProduction({ mode: 'criar', txid }, config, m.dependencies), (error) => error.testTxid === txid && error.testStage === 'criacao');
  assert.deepEqual(m.calls.map((c) => c.method), ['GET', 'PUT']);
  assert.equal(m.destroyed, 1);
});

test('consultation never creates and invalid/different response never reports success', async () => {
  const missing = mock({ get: async () => { throw providerError(404); } });
  await assert.rejects(runProduction({ mode: 'consultar', txid }, config, missing.dependencies));
  assert.deepEqual(missing.calls.map((c) => c.method), ['GET']);
  for (const response of [null, {}, { ...charge, txid: 'OTHER' }, { ...charge, valor: { original: '99.00' } }]) {
    const m = mock({ get: async () => response });
    await assert.rejects(runProduction({ mode: 'consultar', txid }, config, m.dependencies), /nao corresponde/);
    assert.equal(m.destroyed, 1);
  }
});
