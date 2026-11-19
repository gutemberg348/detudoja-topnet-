import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { certificateBundle } from '../../docker/test-sicredi-pix-curl.js';
import { readMultipagPair } from '../../docker/sicredi-multipag-credentials.js';
import { sicrediHttpRequest } from '../../apps/api/src/modules/payments/sicredi/sicredi.transport.js';

const endpoint = 'https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token';
const scope = 'multipag.pix.consultar';
const certBase = '/etc/detudoja/certificados/sicredi-multipag';
const oauthErrors = new Set(['invalid_client', 'unauthorized_client', 'invalid_scope', 'invalid_request', 'unsupported_grant_type', 'server_error', 'temporarily_unavailable']);

export async function authenticate(pair, agent, request = sicrediHttpRequest) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: pair.clientId,
    client_secret: pair.clientSecret, scope }).toString();
  const { statusCode: http, data } = await request(endpoint, { agent, method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const tokenObtido = http >= 200 && http < 300 && typeof data?.access_token === 'string' && !!data.access_token.trim();
  return { http, tokenObtido,
    escopoConfirmado: tokenObtido && typeof data.scope === 'string' ? data.scope.split(/\s+/).includes(scope) : null,
    erroOAuth: oauthErrors.has(data?.error) ? data.error : null };
}

async function main() {
  // A localização do .env independe do diretório atual e das variáveis do processo.
  const envText = readFileSync(new URL('.env', import.meta.url), 'utf8');
  const pair = readMultipagPair(envText);
  const passphrase = /^SICREDI_MULTIPAG_CERT_PASSPHRASE=([^\r\n]*)/m.exec(envText)?.[1] || undefined;
  const key = readFileSync(certBase + '.key');
  const bundle = certificateBundle(readFileSync(certBase + '.cer'), key, readFileSync(certBase + '-chain.cer'), passphrase);
  const agent = new https.Agent({ cert: bundle.pem, key, passphrase });
  const evidence = { utc: new Date().toISOString(), produto: 'Multipag', ambiente: 'production', endpoint,
    metodo: 'POST', scope, origem: 'testes/multipag/.env', certificado: bundle.metadata,
    clientIdSha256: createHash('sha256').update(pair.clientId).digest('hex') };
  try {
    const result = await authenticate(pair, agent);
    console.log(JSON.stringify({ ...evidence, ...result }, null, 2));
    if (!result.tokenObtido || result.escopoConfirmado === false) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ...evidence, erro: 'Sem resposta HTTP utilizável. Verifique conexão e TLS.' }, null, 2));
    process.exitCode = 1;
  } finally { agent.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error('[Multipag] Falha local:', error.message); process.exitCode = 1; });
}
