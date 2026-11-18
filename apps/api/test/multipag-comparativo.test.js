import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, readMultipagPair } from '../../../docker/diagnostico-multipag-producao.js';

const pix = { clientId: 'pix-fixture', clientSecret: 'pix-secret' };
const multi = { clientId: 'multi-fixture', clientSecret: '$%#+&=secret' };

test('o mesmo agente mTLS vai aos dois endpoints com pares e protocolos distintos', async () => {
  const agent = {}, logs = [], scopes = [];
  const pass = await compare(pix, multi, agent, { log: x => logs.push(x), request: async (url, opts) => {
    assert.equal(opts.agent, agent);
    assert.equal(opts.method, 'POST');
    const form = new URLSearchParams(opts.body);
    const scope = form.get('scope');
    scopes.push(scope);
    if (scope === 'cob.read') {
      assert.equal(url, 'https://api-pix.sicredi.com.br/oauth/token');
      assert.equal(opts.headers.Authorization, 'Basic ' + Buffer.from('pix-fixture:pix-secret').toString('base64'));
      assert.equal(form.has('client_secret'), false);
    } else {
      assert.equal(url, 'https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token');
      assert.equal(opts.headers.Authorization, undefined);
      assert.equal(form.get('client_id'), multi.clientId);
      assert.equal(form.get('client_secret'), multi.clientSecret);
    }
    return { statusCode: 200, data: { scope, access_token: 'private-token' } };
  } });
  assert.equal(pass, true);
  assert.deepEqual(scopes, ['cob.read', 'multipag.pix.consultar', 'multipag.pix.pagar']);
  assert.ok(logs.every(x => x.scopeConfirmado));
  assert.doesNotMatch(JSON.stringify(logs), /fixture|secret|private-token/);
});

test('401 interrompe a tentativa seguinte do Multipag e omite campos privados do provedor', async () => {
  const logs = [];
  assert.equal(await compare(pix, multi, {}, { log: x => logs.push(x), request: async () =>
    ({ statusCode: 401, data: { error: 'invalid_client', error_description: multi.clientSecret } }) }), false);
  assert.deepEqual(logs.map(x => x.scope), ['cob.read', 'multipag.pix.consultar']);
  assert.doesNotMatch(JSON.stringify(logs), /secret/);
});

test('parser preserva caracteres do secret e recusa duplicatas e sandbox', () => {
  const lines = 'SICREDI_MULTIPAG_CLIENT_ID=' + multi.clientId + '\r\nSICREDI_MULTIPAG_CLIENT_SECRET=' + multi.clientSecret;
  assert.deepEqual(readMultipagPair(lines), multi);
  assert.throws(() => readMultipagPair(lines + '\n' + lines), /duplicada/);
  assert.throws(() => readMultipagPair(lines + '\nSICREDI_MULTIPAG_ENV=sandbox'), /production/);
});
