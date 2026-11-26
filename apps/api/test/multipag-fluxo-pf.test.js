import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runFlow } from '../../../testes/multipag/pix-pf/fluxo.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'fluxo-pf-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const flow = { txid: 'DTJ' + '0'.repeat(32), receivingKey: 'receber@example.org',
    order: { id: 'PFteste', key: 'destino@example.org', type: 'EMAIL', amountCents: 100, payer: {} } };
  const receipt = { txid: flow.txid, valor: '1.00', endToEndId: 'E' + '0'.repeat(31) };
  const charge = { txid: flow.txid, chave: flow.receivingKey, valor: { original: '1.00' },
    status: 'CONCLUIDA', pix: [receipt] };
  const calls = [];
  const result = { idTransacao: flow.order.id, valorPagamento: 1, status: 'SUCESSO' };
  const transfer = {
    async createPixTransfer(payload) {
      assert.equal(payload.destinationKey, flow.order.key);
      assert.equal(payload.amountCents, 100);
      calls.push('enviar');
      return result;
    },
    async getPixTransfer(id) { assert.equal(id, flow.order.id); calls.push('consultar'); return result; },
  };
  const params = { flow, file: join(dir, 'envio.json'), log() {}, wait: async () => {},
    pix: { async getCharge() { return charge; },
      async getReceivedPix(id) { assert.equal(id, receipt.endToEndId); calls.push('recebimento'); return receipt; } },
    multipag: () => ({ oauth: { async accessToken() {} }, client: transfer }) };
  return { params, calls, transfer, receipt, charge };
}

test('cria cobrança, aguarda pagamento, confirma o Pix e envia para o destino salvo uma única vez', async t => {
  const { params, calls, charge } = setup(t);
  let exists = false;
  params.pix.getCharge = async () => {
    if (!exists) throw Object.assign(Error(), { providerStage: 'operacao', providerStatusCode: 404 });
    return charge;
  };
  params.pix.createCharge = async ({ id, amountCents }) => {
    assert.equal(id, charge.txid);
    assert.equal(amountCents, 100);
    exists = true;
    return { ...charge, status: 'ATIVA', pix: [], pixCopiaECola: 'teste' };
  };
  params.wait = async () => assert.deepEqual(calls, []);
  await runFlow(params);
  await runFlow(params);
  assert.deepEqual(calls, ['recebimento', 'enviar', 'consultar']);
});

test('consultar uma cobrança paga não inicia repasse', async t => {
  const { params, calls } = setup(t);
  await runFlow({ ...params, readOnly: true });
  assert.deepEqual(calls, ['recebimento']);
  assert.equal(existsSync(params.file), false);
});

test('ambiguidade, divergência ou devolução impede o repasse', async t => {
  for (const change of [
    ({ charge }) => { charge.chave = 'outra'; },
    ({ charge }) => { charge.pix = []; },
    ({ receipt }) => { receipt.txid = 'outro'; },
    ({ receipt }) => { receipt.valor = '0.99'; },
    ({ receipt }) => { receipt.chave = 'outra'; },
    ({ receipt }) => { receipt.devolucoes = [{ status: 'EM_PROCESSAMENTO' }]; },
  ]) {
    const fixture = setup(t);
    change(fixture);
    await assert.rejects(runFlow(fixture.params));
    assert.equal(existsSync(fixture.params.file), false);
  }
});

test('duas execuções confirmando o mesmo recebimento produzem um único envio', async t => {
  const { params, calls } = setup(t);
  await Promise.all([runFlow(params), runFlow(params)]);
  assert.equal(calls.filter(call => call === 'enviar').length, 1);
});

test('após timeout no POST, retomar apenas consulta a referência salva', async t => {
  const { params, calls, transfer } = setup(t);
  transfer.createPixTransfer = async () => { calls.push('enviar'); throw Error('timeout'); };
  await assert.rejects(runFlow(params), /timeout/);
  await runFlow(params);
  assert.deepEqual(calls, ['recebimento', 'enviar', 'consultar']);
});
