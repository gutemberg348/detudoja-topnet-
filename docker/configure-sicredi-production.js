import { chmodSync, copyFileSync, constants, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig } from './test-sicredi-pix-curl.js';

// Runs on the VPS checkout. No network, database changes or secret output.
export function prepareProductionEnv(current, credentials) {
  const source = parseConfig(credentials, 'production');
  const key = source.SICREDI_PIX_TEST_RECEIVING_KEY;
  if (!key || key.length > 77) throw new Error('Preencha a chave Pix no arquivo privado de producao.');
  const values = {
    PAYMENTS_PRIMARY_GATEWAY: 'SICREDI',
    PAYMENTS_FALLBACK_GATEWAY: 'NONE',
    PAYMENTS_ENVIRONMENT: 'production',
    PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED: 'false',
    SICREDI_APP_SANDBOX_ENABLED: 'false',
    SICREDI_PIX_ENABLED: 'true',
    SICREDI_PIX_ENV: 'production',
    SICREDI_PIX_API_URL: 'https://api-pix.sicredi.com.br/api/v2',
    SICREDI_PIX_AUTH_URL: 'https://api-pix.sicredi.com.br/oauth/token',
    SICREDI_PIX_CLIENT_ID: source.SICREDI_PIX_TEST_CLIENT_ID,
    SICREDI_PIX_CLIENT_SECRET: source.SICREDI_PIX_TEST_CLIENT_SECRET,
    SICREDI_PIX_RECEIVING_KEY: key,
    SICREDI_PIX_CERT_PATH: '/run/sicredi/sicredi-multipag.cer',
    SICREDI_PIX_KEY_PATH: '/run/sicredi/sicredi-multipag.key',
    SICREDI_PIX_CHAIN_PATH: '/run/sicredi/sicredi-multipag-chain.cer',
    SICREDI_PIX_CERT_PASSPHRASE: source.SICREDI_PIX_TEST_CERT_PASSPHRASE || '',
    // Pix receiving credentials do not authorize Multipag outgoing transfers.
    SICREDI_MULTIPAG_TRANSFER_ENABLED: 'false',
  };
  // Compatible with both dotenv and Compose env_file format: raw.
  for (const value of Object.values(values)) {
    if (/[\r\n\0#'"\s]/.test(value)) throw new Error('Valor com formato ambiguo no arquivo privado; nao alterado.');
  }
  const lines = current.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    return !Object.hasOwn(values, name);
  });
  // Unrelated settings, including Asaas credentials, are preserved verbatim.
  return { text: `${lines.join('\n').trimEnd()}\n${Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n')}\n`,
    variables: Object.keys(values) };
}

export function configureProduction({ envPath = resolve('apps/api/.env'),
  credentialsPath = '/etc/detudoja/sicredi-pix-production.env', apply = false } = {}) {
  const current = readFileSync(envPath, 'utf8');
  const result = prepareProductionEnv(current, readFileSync(credentialsPath, 'utf8'));
  if (!apply) return { applied: false, variables: result.variables };
  const suffix = randomUUID();
  const backupPath = `${envPath}.sicredi-backup-${suffix}`;
  const temporary = `${envPath}.sicredi-tmp-${suffix}`;
  copyFileSync(envPath, backupPath, constants.COPYFILE_EXCL);
  chmodSync(backupPath, 0o600);
  try {
    writeFileSync(temporary, result.text, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, envPath);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* temporary file may not exist */ }
    throw error;
  }
  return { applied: true, backupPath, variables: result.variables };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length && args[0] !== '--apply')) throw new Error('Uso: node docker/configure-sicredi-production.js [--apply]');
    const result = configureProduction({ apply: args[0] === '--apply' });
    console.log('[sicredi-config]', result);
    console.log(result.applied
      ? '[sicredi-config] Arquivo preparado. Execute check:gateways -- --receive --ledger antes de recriar a API. Saidas Multipag desabilitadas.'
      : '[sicredi-config] Previa: nenhum arquivo alterado. Use --apply para preparar o .env com backup privado.');
  } catch {
    console.error('[sicredi-config] Nao foi possivel preparar a configuracao. Confira arquivos, permissoes, credenciais de producao e chave Pix. Nenhum segredo foi exibido.');
    process.exitCode = 1;
  }
}
