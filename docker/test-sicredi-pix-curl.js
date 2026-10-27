#!/usr/bin/env node
// Diagnostico independente do transporte HTTP da API. Somente Node nativo + curl.
import { spawnSync } from 'node:child_process';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TOKEN_URLS = Object.freeze({
  sandbox: 'https://api-pix-h.sicredi.com.br/oauth/token',
  production: 'https://api-pix.sicredi.com.br/oauth/token',
});
export const MARKER = '\nDTJ_CURL_METADATA\n';
const scopes = ['cob.read', 'cob.write', 'pix.read'];
class ProbeError extends Error {}

function checkEnvironment(values, environment) {
  if (!Object.hasOwn(TOKEN_URLS, environment) || values.SICREDI_PIX_TEST_ENV !== environment) {
    throw new ProbeError('SICREDI_PIX_TEST_ENV deve corresponder a --environment (sandbox ou production).');
  }
}

export function parseConfig(text, environment = 'sandbox') {
  const values = Object.create(null);
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z_0-9]+)=(.*)$/.exec(line);
    if (!match) throw new ProbeError('Arquivo env invalido: use NOME=valor, sem export.');
    const [, name, value] = match;
    if (Object.hasOwn(values, name)) throw new ProbeError('Variavel duplicada no arquivo de teste.');
    if (value !== value.trim() || /^["']/.test(value) || /[\x00-\x1f\x7f]/.test(value)) {
      throw new ProbeError('Remova aspas, espacos nas extremidades ou caracteres de controle do env.');
    }
    values[name] = value;
  }
  checkEnvironment(values, environment);
  for (const key of ['SICREDI_PIX_TEST_CLIENT_ID', 'SICREDI_PIX_TEST_CLIENT_SECRET']) {
    if (!values[key] || values[key].startsWith('SEU_')) throw new ProbeError('Preencha o par SICREDI_PIX_TEST_CLIENT_ID/CLIENT_SECRET.');
  }
  if (values.SICREDI_PIX_TEST_CLIENT_ID.includes(':')) throw new ProbeError('Informe somente o Client ID, sem juntar com o secret.');
  return values;
}

export function parseArgs(args) {
  const options = { environment: 'sandbox', scope: 'cob.read', ipv4: false, tls12: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--ipv4') options.ipv4 = true;
    else if (arg === '--tls12') options.tls12 = true;
    else if (arg === '--environment') options.environment = args[++i];
    else if (arg === '--scope') options.scope = args[++i];
    else throw new ProbeError('Opcao desconhecida. Use --help.');
  }
  if (!Object.hasOwn(TOKEN_URLS, options.environment) || !scopes.includes(options.scope)) {
    throw new ProbeError('Ambiente ou escopo invalido. Use --help.');
  }
  return options;
}

export function quoted(value) {
  if (/[\x00-\x1f\x7f]/.test(value)) throw new ProbeError('Caractere de controle invalido na configuracao curl.');
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function curlConfig(values, cert, key, options) {
  checkEnvironment(values, options.environment);
  if (!scopes.includes(options.scope)) throw new ProbeError('Escopo invalido.');
  const authorization = Buffer.from(`${values.SICREDI_PIX_TEST_CLIENT_ID}:${values.SICREDI_PIX_TEST_CLIENT_SECRET}`).toString('base64');
  const entries = [
    ['url', TOKEN_URLS[options.environment]], ['request', 'POST'], ['cert', cert], ['key', key],
    ['header', `Authorization: Basic ${authorization}`],
    ['header', 'Content-Type: application/x-www-form-urlencoded'], ['header', 'Accept: application/json'],
    ['data', new URLSearchParams({ grant_type: 'client_credentials', scope: options.scope }).toString()],
  ];
  if (values.SICREDI_PIX_TEST_CERT_PASSPHRASE) entries.push(['pass', values.SICREDI_PIX_TEST_CERT_PASSPHRASE]);
  return entries.map(([name, value]) => `${name} = ${quoted(value)}`).join('\n') + '\n';
}

export function certificateBundle(cert, key, chain, passphrase, now = Date.now()) {
  let leaf, privateKey;
  try {
    leaf = new X509Certificate(cert);
    privateKey = createPrivateKey({ key, passphrase: passphrase || undefined });
  } catch { throw new ProbeError('Certificado/chave invalidos. Confira formato e senha.'); }
  if (!leaf.checkPrivateKey(privateKey)) throw new ProbeError('Certificado nao corresponde a chave privada.');
  if (!(Date.parse(leaf.validFrom) <= now && now <= Date.parse(leaf.validTo))) {
    throw new ProbeError('Certificado fora da validade em relacao ao relogio da VPS.');
  }
  const blocks = chain.toString().match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (!blocks.length) throw new ProbeError('Cadeia sem certificados PEM.');
  try { blocks.forEach((block) => new X509Certificate(block)); }
  catch { throw new ProbeError('Cadeia de certificados invalida.'); }
  return {
    pem: `${leaf.toString()}\n${blocks.join('\n')}\n`,
    metadata: { serial: leaf.serialNumber, notBefore: leaf.validFrom, notAfter: leaf.validTo, sha256: leaf.fingerprint256 },
  };
}

export function responseSummary(raw, status, values) {
  let data;
  try { data = JSON.parse(raw); } catch { /* HTML/texto do gateway */ }
  const success = status >= 200 && status < 300 && typeof data?.access_token === 'string' && Boolean(data.access_token.trim());
  const summary = { tokenObtido: success, formato: data === undefined ? 'texto' : 'json', bytes: Buffer.byteLength(raw) };
  if (success) summary.resultado = 'Autenticacao aceita; token descartado sem exibir.';
  else {
    const decoded = raw.replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, number) => {
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : entity;
    });
    summary.erroLeituraGateway = decoded.includes('Internal Server Error - Read');
    const reference = /Reference\s*#([a-zA-Z0-9.\-]{5,100})/.exec(decoded)?.[1];
    const secrets = [values.SICREDI_PIX_TEST_CLIENT_ID, values.SICREDI_PIX_TEST_CLIENT_SECRET, values.SICREDI_PIX_TEST_CERT_PASSPHRASE].filter(Boolean);
    if (reference && !secrets.some((secret) => reference.includes(secret))) summary.referenciaGateway = reference;
    if (['invalid_client', 'invalid_scope', 'unauthorized_client', 'invalid_request', 'unsupported_grant_type'].includes(data?.error)) summary.erroOAuth = data.error;
  }
  return summary;
}

export function main(args = process.argv.slice(2), env = process.env, { run = spawnSync, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) {
    log('Uso: node docker/test-sicredi-pix-curl.js [--environment sandbox|production] [--scope cob.read|cob.write|pix.read] [--ipv4] [--tls12]\nSomente autenticacao; requer Node.js 20+ e curl.');
    return 0;
  }
  const envFile = env.SICREDI_PIX_TEST_ENV_FILE || `/etc/detudoja/sicredi-pix-${options.environment}.env`;
  const values = parseConfig(readFileSync(envFile, 'utf8'), options.environment);
  const directory = env.SICREDI_PIX_TEST_CERT_DIR || '/etc/detudoja/certificados';
  const cert = env.SICREDI_PIX_TEST_CERT_FILE || join(directory, 'sicredi-multipag.cer');
  const key = env.SICREDI_PIX_TEST_KEY_FILE || join(directory, 'sicredi-multipag.key');
  const chain = env.SICREDI_PIX_TEST_CHAIN_FILE || join(directory, 'sicredi-multipag-chain.cer');
  const bundle = certificateBundle(readFileSync(cert), readFileSync(key), readFileSync(chain), values.SICREDI_PIX_TEST_CERT_PASSPHRASE);
  log('[pix-curl] Conferencia local (nao comprova vinculo da credencial no banco):', bundle.metadata);
  log('[pix-curl] Configuracao', { utc: new Date().toISOString(), ...options, url: TOKEN_URLS[options.environment], operacao: 'somente autenticacao', cliente: 'Node.js + curl independente do transporte da API' });
  const temp = mkdtempSync(join(tmpdir(), 'sicredi-pix-probe-'));
  let result;
  try {
    const certBundle = join(temp, 'client-chain.pem');
    writeFileSync(certBundle, bundle.pem, { mode: 0o600 });
    const curlArgs = ['--disable', '--silent', '--show-error', '--http1.1', '--noproxy', '*',
      '--proto', '=https', '--connect-timeout', '10', '--max-time', '30', '--max-filesize', '1048576',
      '--write-out', `${MARKER}%{http_code}\n%{remote_ip}\n%{ssl_verify_result}\n`, '--config', '-'];
    if (options.ipv4) curlArgs.push('--ipv4');
    if (options.tls12) curlArgs.push('--tlsv1.2', '--tls-max', '1.2');
    // Credentials only on stdin: no shell, redirects, retries, curlrc or insecure TLS.
    result = run('curl', curlArgs, { input: curlConfig(values, certBundle, key, options), encoding: 'utf8', timeout: 40_000, maxBuffer: 2_097_152, windowsHide: true });
  } finally {
    // Only the freshly created task directory; no user-derived delete target.
    rmSync(temp, { recursive: true, force: true });
  }
  const output = result.stdout ?? '';
  const marker = output.lastIndexOf(MARKER);
  const parts = marker >= 0 ? output.slice(marker + MARKER.length).split(/\r?\n/) : [];
  const status = /^\d{3}$/.test(parts[0] ?? '') ? Number(parts[0]) : 0;
  const summary = responseSummary(marker >= 0 ? output.slice(0, marker) : '', status, values);
  Object.assign(summary, { http: status, curlExit: result.status, remoteIp: isIP(parts[1] ?? '') ? parts[1] : null, sslVerifyResult: /^\d+$/.test(parts[2] ?? '') ? parts[2] : null });
  if (result.error || result.status !== 0) {
    summary.falhaTransporte = result.error?.code === 'ENOENT' ? 'curl nao instalado na VPS'
      : ({ 6: 'DNS', 7: 'conexao', 28: 'timeout', 35: 'negociacao TLS', 58: 'certificado local', 60: 'confianca no certificado do servidor', 63: 'resposta excedeu limite' }[result.status] || 'Falha curl/timeout local; consulte curlExit');
  }
  log('[pix-curl]', JSON.stringify(summary, null, 2));
  return !result.error && result.status === 0 && summary.tokenObtido ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(); }
  catch (error) {
    // Do not print arbitrary exception messages or child stderr (can echo secrets).
    console.error('[pix-curl] Falha local:', error instanceof ProbeError ? error.message
      : error.code === 'ENOENT' ? 'Arquivo ausente: confira o env e os caminhos dos certificados.' : 'Nao foi possivel executar o diagnostico local. Confira arquivos e permissoes.');
    process.exitCode = 1;
  }
}
