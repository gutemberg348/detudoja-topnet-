import { randomUUID } from 'node:crypto';
import { openSync, fsyncSync, closeSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { readMultipagPair } from '../../../docker/sicredi-multipag-credentials.js';
import { createSicrediMultipagClient, sicrediMultipagConfigFromEnv, sicrediPixKeyForTransfer } from '../../../apps/api/src/modules/payments/sicredi/sicredi.multipag.client.js';
import { createSicrediOAuthClient } from '../../../apps/api/src/modules/payments/sicredi/sicredi.oauth.js';
import { normalizeSicrediTransfer } from '../../../apps/api/src/modules/payments/sicredi/sicredi.validation.js';
import { isValidCpf } from '../../../apps/api/src/utils/cpf.js';

const state = '/etc/detudoja/multipag-teste-pf.json';
const amountCents = 100;
const cert = '/etc/detudoja/certificados/sicredi-multipag';

function destination() {
  const values = {};
  for (const line of readFileSync(new URL('.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^(COOPERATIVA|CONTA_COM_DV|DOCUMENTO_PAGADOR|CPF_FAVORECIDO|TIPO_CHAVE|CHAVE_PIX)=(.+)$/.exec(line);
    if (!match || Object.hasOwn(values, match[1]) || /[\x00-\x1f\x7f]/.test(line)) throw Error('Revise os campos do arquivo pix-pf/.env.');
    values[match[1]] = match[2].trim();
  }
  const {COOPERATIVA: cooperativa, CONTA_COM_DV: conta, DOCUMENTO_PAGADOR: documento,
    CPF_FAVORECIDO: cpf, TIPO_CHAVE: type, CHAVE_PIX: key} = values;
  if (!/^\d{4}$/.test(cooperativa) || !/^\d+$/.test(conta) || !/^\d{11}(\d{3})?$/.test(documento)) throw Error('Confira a cooperativa, conta com DV e documento do pagador.');
  if (!/^\d{11}$/.test(cpf) || !isValidCpf(cpf)) throw Error('Informe um CPF válido do favorecido, com 11 dígitos.');
  if (!['CPF','EMAIL','TELEFONE','ALEATORIA'].includes(type)) throw Error('Tipo de chave inválido.');
  const normalized = sicrediPixKeyForTransfer(type, key);
  if (type === 'CPF' && cpf !== normalized) throw Error('A chave CPF difere do CPF do favorecido.');
  return { payer: {cooperativa, conta, documento}, cpf, type, key: normalized, amountCents };
}

function bank(payer, sending) {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const config = { ...sicrediMultipagConfigFromEnv({ SICREDI_MULTIPAG_ENV: 'production' }),
    ...readMultipagPair(raw), ...payer, transferEnabled: sending,
    mtls: { certPath: cert + '.cer', keyPath: cert + '.key', chainPath: cert + '-chain.cer',
      passphrase: /^SICREDI_MULTIPAG_CERT_PASSPHRASE=([^\r\n]*)/m.exec(raw)?.[1] } };
  const oauth = createSicrediOAuthClient({ ...config, tokenStyle: 'body', scope: sending ? 'multipag.pix.pagar' : 'multipag.pix.consultar' });
  return { oauth, client: createSicrediMultipagClient(config, { oauthFactory: () => oauth }) };
}

// Uma única tentativa nesta VPS. Persistir a referência antes de qualquer POST financeiro.
export async function sendOnce(file, order, client) {
  const fd = openSync(file, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(order)); fsyncSync(fd); } finally { closeSync(fd); }
  if (process.platform !== 'win32') {
    const dir = openSync(dirname(file), 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  return client.createPixTransfer({ amountCents: order.amountCents, date: order.date, destinationDocument: order.cpf,
    destinationKey: order.key, destinationKeyType: order.type, transactionId: order.id });
}

function report(order, response) {
  const checked = normalizeSicrediTransfer({ referencia_externa: order.id, valor_centavos: order.amountCents,
    documento_titular: order.cpf, chave_pix_destino: order.key, tipo_chave: order.type }, response);
  console.log({ idTransacao: order.id, status: checked.status, valor: checked.value });
  if (checked.status === 'PENDING') console.log('Acompanhe com consultar. Confira eventuais aprovações pendentes no Sicredi.');
}

async function main(mode = 'preparar') {
  if (mode === 'consultar') {
    if (!existsSync(state)) throw Error('Ainda não existe uma tentativa salva nesta VPS.');
    const order = JSON.parse(readFileSync(state, 'utf8'));
    report(order, await bank(order.payer, false).client.getPixTransfer(order.id));
    return;
  }
  if (!['preparar','enviar'].includes(mode)) throw Error('Use preparar, enviar ou consultar.');
  if (existsSync(state)) throw Error('Já existe uma tentativa salva. Use consultar para acompanhar.');
  const order = destination();
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  console.log('Pix real de R$ 1,00', { data: date, cooperativa: order.payer.cooperativa, conta: order.payer.conta,
    cpfInformado: order.cpf, tipo: order.type, chaveInformada: order.key });
  const { oauth, client } = bank(order.payer, true);
  await oauth.accessToken();
  console.log('Token de produção obtido com solicitação de multipag.pix.pagar.');
  if (mode === 'preparar') return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('Abra um terminal interativo para confirmar o Pix.');
  const prompt = createInterface({input: process.stdin, output: process.stdout});
  try {
    if (await prompt.question('Para transferir R$ 1,00 à chave acima, digite ENVIAR 1,00: ') !== 'ENVIAR 1,00') {
      console.log('Cancelado.'); return;
    }
  } finally { prompt.close(); }
  order.date = date;
  order.id = 'PF' + randomUUID().replaceAll('-', '');
  console.log('Referência para consulta:', order.id);
  report(order, await sendOnce(state, order, client));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => {
    console.error(error.providerStatusCode ? `Sicredi: HTTP ${error.providerStatusCode} na etapa ${error.providerStage}.` :
      error.code === 'EEXIST' ? 'Outra tentativa já foi registrada.' : error.message);
    if (existsSync(state)) console.error('Preserve o registro e use consultar com a mesma referência.');
    process.exitCode = 1;
  });
}
