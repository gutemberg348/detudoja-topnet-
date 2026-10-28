import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureProduction, prepareProductionEnv } from '../../../docker/configure-sicredi-production.js';

const credentials = 'SICREDI_PIX_TEST_ENV=production\nSICREDI_PIX_TEST_CLIENT_ID=fixture-id\nSICREDI_PIX_TEST_CLIENT_SECRET=fixture-secret\nSICREDI_PIX_TEST_RECEIVING_KEY=receiver@example.com\n';
const current = '# Keep application settings\nDATABASE_URL=unchanged\nASAAS_API_KEY=$unchanged-secret\nPAYMENTS_PRIMARY_GATEWAY=ASAAS\nPAYMENTS_ENVIRONMENT=sandbox\nPAYMENTS_ENVIRONMENT=sandbox\nSICREDI_MULTIPAG_TRANSFER_ENABLED=true\n';

test('production config reuses isolated Pix credentials, removes duplicate settings and preserves Asaas', () => {
  const result = prepareProductionEnv(current, credentials);
  assert.match(result.text, /SICREDI_PIX_CLIENT_ID=fixture-id\n/);
  assert.match(result.text, /SICREDI_PIX_CLIENT_SECRET=fixture-secret\n/);
  assert.match(result.text, /SICREDI_PIX_RECEIVING_KEY=receiver@example.com\n/);
  assert.match(result.text, /ASAAS_API_KEY=\$unchanged-secret\n/);
  assert.match(result.text, /DATABASE_URL=unchanged\n/);
  assert.match(result.text, /PAYMENTS_PRIMARY_GATEWAY=SICREDI\n/);
  assert.match(result.text, /PAYMENTS_FALLBACK_GATEWAY=NONE\n/);
  assert.match(result.text, /SICREDI_MULTIPAG_TRANSFER_ENABLED=false\n/);
  assert.match(result.text, /PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED=false\n/);
  assert.equal(result.text.match(/^PAYMENTS_ENVIRONMENT=/gm).length, 1);
  assert.equal(prepareProductionEnv(result.text, credentials).text, result.text);
});

test('sandbox credentials, missing key and ambiguous dotenv values are refused', () => {
  for (const invalid of [credentials.replace('production', 'sandbox'), credentials.replace('receiver@example.com', ''), credentials.replace('fixture-secret', 'fixture#secret')]) {
    assert.throws(() => prepareProductionEnv(current, invalid));
  }
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'sicredi-config-test-'));
  t.after(() => {
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  });
  const paths = { envPath: join(directory, '.env'), credentialsPath: join(directory, 'private.env') };
  writeFileSync(paths.envPath, current);
  writeFileSync(paths.credentialsPath, credentials);
  return { directory, paths };
}

test('preview never changes files or returns credential values', (t) => {
  const { directory, paths } = fixture(t);
  const result = configureProduction(paths);
  assert.equal(result.applied, false);
  assert.equal(readFileSync(paths.envPath, 'utf8'), current);
  assert.equal(readdirSync(directory).length, 2);
  assert.doesNotMatch(JSON.stringify(result), /fixture-id|fixture-secret|receiver@example.com|unchanged-secret/);
});

test('apply backs up exact env, writes configuration and does not leak secrets in result', (t) => {
  const { directory, paths } = fixture(t);
  const result = configureProduction({ ...paths, apply: true });
  assert.equal(readFileSync(result.backupPath, 'utf8'), current);
  assert.equal(readFileSync(paths.envPath, 'utf8'), prepareProductionEnv(current, credentials).text);
  assert.equal(readFileSync(paths.credentialsPath, 'utf8'), credentials);
  assert.equal(readdirSync(directory).length, 3);
  assert.doesNotMatch(JSON.stringify(result), /fixture-id|fixture-secret|receiver@example.com|unchanged-secret/);
});

test('invalid credentials leave original env untouched and create no backup', (t) => {
  const { directory, paths } = fixture(t);
  writeFileSync(paths.credentialsPath, credentials.replace('production', 'sandbox'));
  assert.throws(() => configureProduction({ ...paths, apply: true }));
  assert.equal(readFileSync(paths.envPath, 'utf8'), current);
  assert.equal(readdirSync(directory).length, 2);
});
