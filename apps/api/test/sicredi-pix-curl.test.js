import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { X509Certificate, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { certificateBundle, curlConfig, main, MARKER, parseArgs, parseConfig, quoted, responseSummary, TOKEN_URLS } from '../../../docker/test-sicredi-pix-curl.js';

const values = { SICREDI_PIX_TEST_ENV: 'sandbox', SICREDI_PIX_TEST_CLIENT_ID: 'test-client', SICREDI_PIX_TEST_CLIENT_SECRET: 'secret+&=value' };
const envText = (v = values) => Object.entries(v).map(([k, value]) => `${k}=${value}`).join('\n');

test('env parser rejects mixed environments, duplicates and shell/quoted syntax', () => {
  assert.deepEqual({ ...parseConfig('\uFEFF' + envText().replaceAll('\n', '\r\n')) }, values);
  assert.equal(parseConfig(envText().replace('secret+&=value', '$(no-shell)')).SICREDI_PIX_TEST_CLIENT_SECRET, '$(no-shell)');
  for (const text of [envText().replace('sandbox', 'production'), envText() + '\nSICREDI_PIX_TEST_ENV=sandbox',
    envText().replace('test-client', '"test-client"'), envText().replace('test-client', ' test-client'),
    envText().replace('test-client', 'id:secret'), envText().replace('test-client', 'SEU_CLIENT_ID'), 'export ' + envText()]) {
    assert.throws(() => parseConfig(text));
  }
});

test('CLI defaults to sandbox and only permits token scopes and known options', () => {
  assert.equal(parseArgs([]).environment, 'sandbox');
  assert.equal(parseArgs(['--environment', 'production']).scope, 'cob.read');
  assert.equal(parseArgs(['--ipv4', '--tls12']).tls12, true);
  for (const args of [['--environment'], ['--environment', 'other'], ['--scope', 'pix.write'], ['--url', 'https://other.invalid'], ['criar']]) assert.throws(() => parseArgs(args));
});

test('production config is explicit, Basic encoded once, form encoded and only token URL allowed', () => {
  const production = { ...values, SICREDI_PIX_TEST_ENV: 'production' };
  assert.equal(parseConfig(envText(production), 'production').SICREDI_PIX_TEST_ENV, 'production');
  const options = parseArgs(['--environment', 'production']);
  const config = curlConfig(production, '/cert.pem', '/key.pem', options);
  assert.ok(config.includes(`url = "${TOKEN_URLS.production}"`));
  assert.ok(config.includes(Buffer.from('test-client:secret+&=value').toString('base64')));
  assert.ok(config.includes('data = "grant_type=client_credentials&scope=cob.read"'));
  assert.ok(!config.includes('secret+&=value'));
  assert.throws(() => curlConfig(values, '/cert.pem', '/key.pem', options));
  assert.throws(() => curlConfig(production, '/cert.pem', '/key.pem', parseArgs([])));
});

test('curl config escapes paths and prevents newline option injection', () => {
  assert.equal(quoted('path\\with"quote'), '"path\\\\with\\"quote"');
  assert.throws(() => quoted('x\nurl=https://other.invalid'));
});

test('success never exposes token or arbitrary response fields', () => {
  const raw = JSON.stringify({ access_token: 'PRIVATE-TOKEN', scope: values.SICREDI_PIX_TEST_CLIENT_SECRET });
  const summary = responseSummary(raw, 200, values);
  assert.equal(summary.tokenObtido, true);
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE-TOKEN|secret\+&=value/);
  assert.equal(responseSummary(raw, 500, values).tokenObtido, false);
  for (const raw of ['{}', 'null', '{"access_token":true}']) assert.equal(responseSummary(raw, 200, values).tokenObtido, false);
});

test('real gateway error shape preserves reference and HTTP errors do not become success', () => {
  const raw = '<html>Internal Server Error - Read Reference&#32;&#35;3&#46;69c41002&#46;1792786918&#46;230c1b5c secret+&=value</html>';
  const summary = responseSummary(raw, 500, values);
  assert.equal(summary.erroLeituraGateway, true);
  assert.equal(summary.referenciaGateway, '3.69c41002.1792786918.230c1b5c');
  assert.doesNotMatch(JSON.stringify(summary), /secret\+&=value/);
  assert.equal(responseSummary('{"error":"invalid_client","detail":"private"}', 401, values).erroOAuth, 'invalid_client');
});

// Synthetic local certificate only. No banking credentials or network requests.
const folder = mkdtempSync(join(tmpdir(), 'pix-node-tests-'));
after(() => rmSync(folder, { recursive: true, force: true }));
const certFile = join(folder, 'cert.pem'), keyFile = join(folder, 'key.pem');
const openssl = process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
const generated = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=offline-test', '-keyout', keyFile, '-out', certFile], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
assert.equal(generated.status, 0, 'OpenSSL necessario apenas para gerar certificado sintetico dos testes');
const cert = readFileSync(certFile), key = readFileSync(keyFile);

test('native crypto validates PEM/DER, key pair, validity and chain format', () => {
  const pem = certificateBundle(cert, key, cert, '');
  assert.equal(certificateBundle(new X509Certificate(cert).raw, key, cert, '').pem, pem.pem);
  assert.ok(pem.metadata.sha256);
  assert.throws(() => certificateBundle(cert, key, cert, '', 0), /fora da validade/);
  assert.throws(() => certificateBundle(cert, key, Buffer.from('invalid'), ''), /Cadeia/);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => certificateBundle(cert, other, cert, ''), /nao corresponde/);
});

test('main calls curl once with credentials on stdin, cleans temporary cert and distinguishes HTTP', () => {
  for (const environment of ['sandbox', 'production']) for (const status of [200, 500]) {
    const envFile = join(folder, `${environment}.env`);
    writeFileSync(envFile, envText({ ...values, SICREDI_PIX_TEST_ENV: environment }));
    const env = { SICREDI_PIX_TEST_ENV_FILE: envFile, SICREDI_PIX_TEST_CERT_FILE: certFile, SICREDI_PIX_TEST_KEY_FILE: keyFile, SICREDI_PIX_TEST_CHAIN_FILE: certFile };
    let calls = 0, temporaryCert;
    const logs = [];
    const exit = main(['--environment', environment, '--ipv4', '--tls12'], env, {
      log: (...args) => logs.push(args),
      run: (command, args, options) => {
        calls++;
        assert.equal(command, 'curl');
        assert.equal(args[0], '--disable');
        for (const flag of ['--ipv4', '--tlsv1.2', '--tls-max', '--config']) assert.ok(args.includes(flag));
        for (const flag of ['--insecure', '--location', '--retry', '--verbose']) assert.ok(!args.includes(flag));
        assert.ok(options.input.includes(TOKEN_URLS[environment]));
        assert.ok(options.input.includes('Authorization: Basic'));
        assert.doesNotMatch(JSON.stringify(args), /test-client|secret/);
        temporaryCert = options.input.split('\n').find((line) => line.startsWith('cert = ')).slice(8, -1).replace(/\\\\/g, '\\');
        assert.ok(existsSync(temporaryCert));
        const raw = status === 200 ? '{"access_token":"PRIVATE-TOKEN"}' : 'Internal Server Error - Read';
        return { status: 0, stdout: `${raw}${MARKER}${status}\n192.0.2.1\n0\n`, stderr: 'SECRET-STDERR' };
      },
    });
    assert.equal(exit, status === 200 ? 0 : 1);
    assert.equal(calls, 1);
    assert.equal(existsSync(temporaryCert), false);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE-TOKEN|SECRET-STDERR|secret\+&=value/);
  }
});

test('mismatched production env is refused before curl or certificate access', () => {
  const envFile = join(folder, 'sandbox-only.env');
  writeFileSync(envFile, envText());
  assert.throws(() => main(['--environment', 'production'], { SICREDI_PIX_TEST_ENV_FILE: envFile }, {
    run: () => assert.fail('must not call curl'), log: () => {},
  }), /corresponder/);
});
