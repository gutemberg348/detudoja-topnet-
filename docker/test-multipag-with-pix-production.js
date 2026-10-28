import { readFileSync } from 'node:fs';
import https from 'node:https';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { certificateBundle } from './test-sicredi-pix-curl.js';
import { productionConfig } from '../apps/api/scripts/sicredi-pix-production.js';
import { errorSummary } from '../apps/api/scripts/sicredi-pix-sandbox.js';
import { assertSicrediSuccess, sicrediHttpRequest } from '../apps/api/src/modules/payments/sicredi/sicredi.transport.js';

const tokenUrl = 'https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token';
const scopes = ['multipag.pix.consultar', 'multipag.pix.pagar'];
function loadAgent(config) {
  const key = readFileSync(config.keyPath);
  const bundle = certificateBundle(readFileSync(config.certPath), key, readFileSync(config.chainPath), config.passphrase);
  return new https.Agent({ cert: bundle.pem, key, passphrase: config.passphrase || undefined });
}

export async function probeMultipagCredentials(config, { httpRequest = sicrediHttpRequest, agentLoader = loadAgent, log = console.log } = {}) {
  if (config.environment !== 'production' || !config.clientId || !config.clientSecret) throw new Error('Exige credenciais de producao da API Pix no arquivo privado.');
  const agent = await agentLoader(config);
  const results = [];
  try {
    log('[multipag-prod-probe] Somente autenticacao. Par do arquivo Pix de producao; nenhum pagamento, consulta de clientes ou alteracao de configuracao.', { tokenUrl });
    for (const scope of scopes) {
      try {
        const response = await httpRequest(tokenUrl, {
          agent, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret, scope }).toString(),
        });
        const data = assertSicrediSuccess(response, 'a autenticacao', {
          sensitiveValues: [config.clientId, config.clientSecret], method: 'POST', path: '/thirdparty/auth/token', stage: 'autenticacao',
        });
        const tokenObtido = typeof data?.access_token === 'string' && data.access_token.length > 0;
        const scopeConfirmado = data?.scope == null ? null : String(data.scope).split(/\s+/).includes(scope);
        const result = { scope, http: response.statusCode, tokenObtido, scopeConfirmado };
        results.push(result);
        log('[multipag-prod-probe]', result);
      } catch (error) {
        results.push({ scope, tokenObtido: false });
        log('[multipag-prod-probe] Falha', { scope, ...errorSummary(error, config) });
      }
    }
    log('[multipag-prod-probe] Tokens descartados sem exibir. Token aceito nao comprova envio/liquidacao. Escopo nao informado na resposta aparece como null.');
    return results;
  } finally { agent.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Este comando nao aceita argumentos.');
    const result = await probeMultipagCredentials(productionConfig());
    if (result.some((item) => !item.tokenObtido || item.scopeConfirmado === false)) process.exitCode = 1;
  } catch {
    console.error('[multipag-prod-probe] Verifique o arquivo privado de producao e os certificados. Nao foi possivel concluir o teste.');
    process.exitCode = 1;
  }
}
