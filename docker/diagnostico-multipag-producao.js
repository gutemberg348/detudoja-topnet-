import { readFileSync } from 'node:fs';
import https from 'node:https';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productionConfig } from '../apps/api/scripts/sicredi-pix-production.js';
import { sicrediHttpRequest } from '../apps/api/src/modules/payments/sicredi/sicredi.transport.js';
import { certificateBundle, TOKEN_URLS } from './test-sicredi-pix-curl.js';

const multipagUrl = 'https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token';
const multipagFile = '/etc/detudoja/sicredi-multipag-production.env';
const pixFile = '/etc/detudoja/sicredi-pix-production.env';

export function readMultipagPair(text) {
  const values = new Map();
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*(SICREDI_MULTIPAG_(?:CLIENT_ID|CLIENT_SECRET|ENV))=(.*)$/.exec(line);
    if (!match) continue;
    const [, name, value] = match;
    if (values.has(name)) throw new Error(`Variável duplicada: ${name}`);
    if (!value || value.trim() !== value || /^(["']).*\1$/.test(value)) {
      throw new Error(`Confira espaços, aspas e preenchimento de ${name}`);
    }
    values.set(name, value);
  }
  if (values.has('SICREDI_MULTIPAG_ENV') && values.get('SICREDI_MULTIPAG_ENV') !== 'production') {
    throw new Error('O ambiente indicado no arquivo Multipag precisa ser production.');
  }
  const clientId = values.get('SICREDI_MULTIPAG_CLIENT_ID');
  const clientSecret = values.get('SICREDI_MULTIPAG_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Falta o ID ou Secret Multipag no arquivo selecionado.');
  if (clientId === 'multipag-sandbox-client') throw new Error('O ID informado é o do sandbox Multipag.');
  return { clientId, clientSecret };
}

export async function compare(pix, multipag, agent, { request = sicrediHttpRequest, log = console.log } = {}) {
  let passed = true;
  for (const scope of ['cob.read', 'multipag.pix.consultar', 'multipag.pix.pagar']) {
    const isPix = scope === 'cob.read';
    const url = isPix ? TOKEN_URLS.production : multipagUrl;
    const form = new URLSearchParams({ grant_type: 'client_credentials', scope });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (isPix) headers.Authorization = 'Basic ' + Buffer.from(pix.clientId + ':' + pix.clientSecret).toString('base64');
    else {
      form.set('client_id', multipag.clientId);
      form.set('client_secret', multipag.clientSecret);
    }
    const context = { utc: new Date().toISOString(), url, scope };
    let response;
    try {
      response = await request(url, { agent, method: 'POST', headers, body: form.toString() });
    } catch {
      log({ ...context, resultado: 'Falha de transporte antes de receber resposta HTTP' });
      passed = false;
      continue;
    }
    const { statusCode: http, data } = response;
    const tokenObtido = http >= 200 && http < 300 && typeof data?.access_token === 'string' && !!data.access_token.trim();
    const scopeConfirmado = tokenObtido && typeof data.scope === 'string' ? data.scope.split(/\s+/).includes(scope) : null;
    const oauthErrors = ['invalid_client', 'invalid_scope', 'invalid_request', 'unauthorized_client', 'unsupported_grant_type'];
    log({ ...context, http, tokenObtido, scopeConfirmado,
      erroOAuth: oauthErrors.includes(data?.error) ? data.error : null });
    if (!tokenObtido || scopeConfirmado === false) passed = false;
    if (!isPix && http === 401 && data?.error === 'invalid_client') break;
  }
  return passed;
}

async function main() {
  if (process.argv.length > 3) throw new Error('Uso: node docker/diagnostico-multipag-producao.js [arquivo-env-multipag]');
  const file = resolve(process.argv[2] || multipagFile);
  console.log({ ambiente: 'production', arquivoPix: pixFile, arquivoMultipag: file });
  const pix = productionConfig({ SICREDI_PIX_TEST_ENV_FILE: pixFile });
  const multipag = readMultipagPair(readFileSync(file, 'utf8'));
  const key = readFileSync(pix.keyPath);
  const bundle = certificateBundle(readFileSync(pix.certPath), key, readFileSync(pix.chainPath), pix.passphrase);
  console.log({ certificadoCompartilhado: bundle.metadata, mesmoClientId: pix.clientId === multipag.clientId });
  const agent = new https.Agent({ cert: bundle.pem, key, passphrase: pix.passphrase || undefined });
  try { if (!await compare(pix, multipag, agent)) process.exitCode = 1; }
  finally { agent.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error('[diagnóstico]', error.message); process.exitCode = 1; });
}
