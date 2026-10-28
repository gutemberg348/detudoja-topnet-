import assert from 'node:assert/strict';
import test from 'node:test';
import { probeMultipagCredentials } from '../../../docker/test-multipag-with-pix-production.js';

const config = { environment: 'production', clientId: 'fixture-id', clientSecret: 'fixture-secret' };
test('probe uses Pix credential pair only at fixed Multipag token endpoint, never sends payment', async () => {
  const calls = [], logs = [];
  let destroyed = false;
  const results = await probeMultipagCredentials(config, {
    agentLoader: async () => ({ destroy() { destroyed = true; } }),
    log: (...args) => logs.push(args),
    httpRequest: async (url, options) => {
      assert.equal(url, 'https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token');
      assert.equal(options.method, 'POST');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('client_id'), config.clientId);
      assert.equal(form.get('client_secret'), config.clientSecret);
      assert.equal(form.get('grant_type'), 'client_credentials');
      calls.push(form.get('scope'));
      return { statusCode: 200, data: { access_token: 'private-token', scope: form.get('scope') } };
    },
  });
  assert.deepEqual(calls, ['multipag.pix.consultar', 'multipag.pix.pagar']);
  assert.ok(results.every((r) => r.tokenObtido && r.scopeConfirmado));
  assert.equal(destroyed, true);
  assert.doesNotMatch(JSON.stringify(logs), /fixture-id|fixture-secret|private-token/);
});

test('authentication refusal is sanitized and never retried for the same scope', async () => {
  let calls = 0;
  const logs = [];
  const result = await probeMultipagCredentials(config, {
    agentLoader: async () => ({ destroy() {} }), log: (...args) => logs.push(args),
    httpRequest: async () => { calls++; return { statusCode: 401, data: { error: 'invalid_client', error_description: 'Client authentication failed fixture-id fixture-secret' } }; },
  });
  assert.equal(calls, 2);
  assert.ok(result.every((r) => !r.tokenObtido));
  assert.doesNotMatch(JSON.stringify(logs), /fixture-id|fixture-secret/);
  assert.match(JSON.stringify(logs), /401/);
  const failures = logs.filter(([label]) => label.endsWith('Falha'));
  assert.equal(failures.length, 2);
  for (const [, output] of failures) {
    assert.equal(typeof output, 'string');
    const details = JSON.parse(output);
    assert.equal(details.status, 401);
    assert.match(output, /Client authentication failed/);
    assert.doesNotMatch(output, /\[Array\]/);
  }
});

test('sandbox is refused before certificates/network and absent scope is not claimed as confirmed', async () => {
  await assert.rejects(probeMultipagCredentials({ ...config, environment: 'sandbox' }, { agentLoader: async () => assert.fail('no certificate access') }));
  const result = await probeMultipagCredentials(config, {
    agentLoader: async () => ({ destroy() {} }), log() {},
    httpRequest: async () => ({ statusCode: 200, data: { access_token: 'private-token' } }),
  });
  assert.ok(result.every((r) => r.tokenObtido && r.scopeConfirmado === null));
});
