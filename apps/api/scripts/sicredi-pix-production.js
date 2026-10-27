import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { certificateBundle, parseConfig } from '../../../docker/test-sicredi-pix-curl.js';
import { createSicrediOAuthClient } from '../src/modules/payments/sicredi/sicredi.oauth.js';
import { errorSummary } from './sicredi-pix-sandbox.js';

export const PRODUCTION = Object.freeze({
  apiUrl: 'https://api-pix.sicredi.com.br/api/v2',
  tokenUrl: 'https://api-pix.sicredi.com.br/oauth/token',
});

export function parseProductionCommand(args) {
  const [mode = 'diagnostico', value] = args;
  if (!['diagnostico', 'criar', 'consultar'].includes(mode) || args.length > 2 || (mode === 'diagnostico' && value !== undefined)) {
    throw new Error('Uso: diagnostico | criar [TXID] | consultar TXID');
  }
  if (mode === 'diagnostico') return { mode };
  const txid = value ?? (mode === 'criar' ? `DTJPROD${randomBytes(12).toString('hex')}` : '');
  if (!/^DTJPROD[A-Za-z0-9]{19,28}$/.test(txid)) throw new Error('Use TXID de teste com prefixo DTJPROD, 26 a 35 caracteres alfanumericos.');
  return { mode, txid };
}

export function productionConfig(env = process.env) {
  const source = parseConfig(readFileSync(env.SICREDI_PIX_TEST_ENV_FILE || '/etc/detudoja/sicredi-pix-production.env', 'utf8'), 'production');
  const certDir = env.SICREDI_PIX_TEST_CERT_DIR || '/etc/detudoja/certificados';
  return {
    ...PRODUCTION, environment: 'production', credentialSource: 'SICREDI_PIX_TEST',
    clientId: source.SICREDI_PIX_TEST_CLIENT_ID, clientSecret: source.SICREDI_PIX_TEST_CLIENT_SECRET,
    pixKey: source.SICREDI_PIX_TEST_RECEIVING_KEY || '',
    certPath: env.SICREDI_PIX_TEST_CERT_FILE || join(certDir, 'sicredi-multipag.cer'),
    keyPath: env.SICREDI_PIX_TEST_KEY_FILE || join(certDir, 'sicredi-multipag.key'),
    chainPath: env.SICREDI_PIX_TEST_CHAIN_FILE || join(certDir, 'sicredi-multipag-chain.cer'),
    passphrase: source.SICREDI_PIX_TEST_CERT_PASSPHRASE,
  };
}

function loadAgent(config) {
  const key = readFileSync(config.keyPath);
  const bundle = certificateBundle(readFileSync(config.certPath), key, readFileSync(config.chainPath), config.passphrase);
  return new https.Agent({ cert: bundle.pem, key, passphrase: config.passphrase || undefined, keepAlive: true });
}

export async function runProduction(command, config, { oauthFactory = createSicrediOAuthClient, agentLoader = loadAgent, log = console.log } = {}) {
  command = parseProductionCommand([command.mode, command.txid].filter((value) => value !== undefined));
  if (config.environment !== 'production' || config.apiUrl !== PRODUCTION.apiUrl || config.tokenUrl !== PRODUCTION.tokenUrl) {
    throw new Error('Este teste exige arquivo de producao e endpoints fixos Pix Sicredi de producao.');
  }
  if (command.mode === 'criar' && (!config.pixKey || config.pixKey.length > 77)) throw new Error('Preencha SICREDI_PIX_TEST_RECEIVING_KEY no arquivo separado de producao.');
  const { mode, txid } = command;
  log('[pix-producao] Configuracao', { mode, environment: 'production', ...PRODUCTION, chaveConfigurada: Boolean(config.pixKey) });
  if (txid) log('[pix-producao] GUARDE O TXID para consulta e novas tentativas:', txid);
  let stage = 'certificado', agent;
  try {
    agent = await agentLoader(config);
    log('[pix-producao] Certificado/chave correspondem, cadeia lida e validade local conferida.');
    if (mode === 'diagnostico') return;
    const clients = new Map();
    const scoped = (scope) => {
      if (!clients.has(scope)) clients.set(scope, oauthFactory({ ...config, scope, tokenStyle: 'basic' }, { mtlsLoader: async () => agent }));
      return clients.get(scope);
    };
    stage = 'consulta';
    let charge;
    try {
      charge = await scoped('cob.read').request(`/cob/${txid}`);
    } catch (error) {
      if (mode !== 'criar' || error.providerStatusCode !== 404 || error.providerStage !== 'operacao') throw error;
      stage = 'criacao';
      log('[pix-producao] Criando cobranca REAL de R$ 1,00, com expiracao de 1 hora.');
      charge = await scoped('cob.write').request(`/cob/${txid}`, {
        method: 'PUT', body: {
          calendario: { expiracao: 3600 }, valor: { original: '1.00', modalidadeAlteracao: '0' },
          chave: config.pixKey, solicitacaoPagador: 'Teste de integracao Pix - R$ 1,00',
        },
      });
    }
    if (!charge || charge.txid !== txid || typeof charge.status !== 'string' || charge.valor?.original !== '1.00') {
      throw new Error('Resposta nao corresponde a cobranca de teste de R$ 1,00. Consulte o mesmo TXID; nao crie outro por tentativa.');
    }
    log('[pix-producao] Cobranca', { txid, status: charge.status, valor: charge.valor.original,
      resultado: stage === 'criacao' ? 'criada' : 'consultada; nenhum PUT realizado' });
    log('[pix-producao] Recebimentos registrados pelo banco', Array.isArray(charge.pix)
      ? charge.pix.map((pix) => ({ valor: pix.valor, horario: pix.horario })) : []);
    if (typeof charge.pixCopiaECola === 'string' && charge.pixCopiaECola.length) {
      log('[pix-producao] Pix copia e cola retornado pelo banco:', charge.pixCopiaECola);
    } else log('[pix-producao] Banco nao retornou copia e cola; consulte o mesmo TXID.');
    log('[pix-producao] Pagamento, se realizado, entra na conta Sicredi. Este teste nao credita carteira, cashback ou pedidos do app.');
    return charge;
  } catch (error) {
    error.testStage = stage;
    error.testTxid = txid;
    throw error;
  } finally { agent?.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let config;
  try {
    const command = parseProductionCommand(process.argv.slice(2));
    config = productionConfig();
    await runProduction(command, config);
  } catch (error) {
    console.error('[pix-producao] Falha:', JSON.stringify(errorSummary(error, config), null, 2));
    if (error.testTxid) console.error('[pix-producao] Consulte o MESMO TXID antes de tentar criar outra cobranca:', error.testTxid);
    process.exitCode = 1;
  }
}
