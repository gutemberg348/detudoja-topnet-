import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { productionConfig } from '../../../apps/api/scripts/sicredi-pix-production.js';
import { createSicrediPixClient } from '../../../apps/api/src/modules/payments/sicredi/sicredi.pix.client.js';
import { validateSicrediCharge, validateSicrediReceipt } from '../../../apps/api/src/modules/payments/sicredi/sicredi.validation.js';
import { bank, destination, report, saveExclusive, sendOnce } from './teste.mjs';

const flowFile = '/etc/detudoja/teste-fluxo-pix-pf.json';
const transferFile = '/etc/detudoja/teste-fluxo-pix-pf-envio.json';
const amountCents = 100;

export async function runFlow({ flow, file, pix, multipag = bank, readOnly, wait = sleep, log = console.log }) {
  const { order, txid, receivingKey } = flow;
  if (order.amountCents !== amountCents) throw Error('Valor salvo diferente de R$ 1,00. Confira o registro.');
  const payment = { gateway_pagamento_id: txid, valor_pago_pix_centavos: amountCents };
  log('TXID da cobrança', txid, '| Referência do repasse', order.id);
  const checkTransfer = async () => {
    const result = await multipag(order.payer, false).client.getPixTransfer(order.id);
    report(order, result);
  };
  if (existsSync(file)) return checkTransfer();

  let charge;
  try {
    charge = await pix.getCharge(txid);
  } catch (error) {
    if (readOnly || error.providerStage !== 'operacao' || error.providerStatusCode !== 404) throw error;
    charge = await pix.createCharge({ id: txid, amountCents, description: 'Teste de recebimento e repasse' });
  }
  const deadline = Date.now() + 3600_000;
  let printedCode;
  while (true) {
    validateSicrediCharge(payment, charge, receivingKey);
    if (charge.status === 'CONCLUIDA') break;
    if (charge.status !== 'ATIVA' || readOnly) {
      log('Situação da cobrança', charge.status);
      return;
    }
    const expires = Date.parse(charge.calendario?.criacao) + Number(charge.calendario?.expiracao) * 1000;
    if (Date.now() >= expires || Date.now() >= deadline) {
      log('Prazo de espera encerrado. Use consultar para verificar a cobrança.');
      return;
    }
    if (charge.pixCopiaECola && printedCode !== charge.pixCopiaECola) {
      printedCode = charge.pixCopiaECola;
      log('Pague R$ 1,00 com este Pix Copia e Cola:');
      log(printedCode);
      log('Aguardando confirmação do Sicredi…');
    } else if (printedCode === undefined && !charge.pixCopiaECola) {
      printedCode = null;
      log('Cobrança ativa. Aguardando o Pix Copia e Cola do Sicredi…');
    }
    await wait(5000);
    charge = await pix.getCharge(txid);
  }

  if (!Array.isArray(charge.pix) || charge.pix.length !== 1) throw Error('Confira no Sicredi os recebimentos vinculados ao TXID.');
  const e2e = charge.pix[0].endToEndId;
  const receipt = await pix.getReceivedPix(e2e);
  validateSicrediReceipt(payment, receipt, e2e);
  if (receipt.chave != null && receipt.chave !== receivingKey) throw Error('A chave do recebimento diverge da cobrança.');
  if (receipt.devolucoes != null && (!Array.isArray(receipt.devolucoes) || receipt.devolucoes.length)) {
    throw Error('Confira as devoluções deste recebimento antes de repassar.');
  }
  log('Recebimento de R$ 1,00 confirmado pelo Sicredi.', e2e);
  if (readOnly) {
    log('Sem tentativa de repasse registrada. Use iniciar para retomar o envio autorizado.');
    return;
  }
  const { oauth, client } = multipag(order.payer, true);
  await oauth.accessToken();
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  try {
    report(order, await sendOnce(file, { ...order, date, txid, e2e }, client));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await checkTransfer();
  }
}

async function main(args) {
  const [mode] = args;
  if (args.length !== 1 || !['iniciar', 'consultar'].includes(mode)) throw Error('Use iniciar ou consultar.');
  const config = productionConfig();
  let flow;
  if (existsSync(flowFile)) {
    flow = JSON.parse(readFileSync(flowFile, 'utf8'));
  } else {
    if (mode === 'consultar') throw Error('Ainda não existe um teste de recebimento e repasse nesta VPS.');
    if (existsSync(transferFile)) throw Error('Já existe registro de envio sem o registro da cobrança. Confira os arquivos da VPS.');
    const order = destination();
    if (!config.pixKey) throw Error('Preencha a chave recebedora da API Pix de produção.');
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('Inicie o teste em um terminal interativo.');
    console.log('Após receber R$ 1,00, o teste enviará R$ 1,00 em produção para a chave', order.key);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (await prompt.question('Para autorizar esse repasse automático, digite REPASSAR 1,00: ') !== 'REPASSAR 1,00') return;
    } finally { prompt.close(); }
    flow = { txid: 'DTJ' + randomUUID().replaceAll('-', ''), receivingKey: config.pixKey,
      order: { ...order, id: 'PF' + randomUUID().replaceAll('-', '') } };
    saveExclusive(flowFile, flow);
  }
  const pix = createSicrediPixClient({ ...config, pixKey: flow.receivingKey, mtls: config });
  await runFlow({ flow, file: transferFile, pix, readOnly: mode === 'consultar' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.providerStatusCode ? `Sicredi respondeu HTTP ${error.providerStatusCode} na etapa ${error.providerStage}.` : error.message);
    if (existsSync(transferFile)) console.error('Tentativa de repasse registrada. Use consultar com a mesma referência.');
    process.exitCode = 1;
  });
}
