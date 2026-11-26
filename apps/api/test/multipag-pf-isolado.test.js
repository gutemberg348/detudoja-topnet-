import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attemptFile, sendOnce } from '../../../testes/multipag/pix-pf/teste.mjs';

test('segundo Pix pode ser enviado com o primeiro pendente e cada comando mantém sua referência', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'multipag-pf-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = join(dir, 'multipag-teste-pf.json');
  const second = attemptFile(dir, 'segundo');
  assert.equal(attemptFile(dir), first);
  assert.throws(() => attemptFile(dir, 'segudno'));
  const sent = [];
  const client = { async createPixTransfer(payload) {
    sent.push(payload.transactionId);
    return { status: 'PENDENTE' };
  } };
  const order = { id: 'PF1', amountCents: 100 };
  await sendOnce(first, order, client);
  await sendOnce(second, { ...order, id: 'PF2' }, client);
  await assert.rejects(sendOnce(second, { ...order, id: 'PF3' }, client), { code: 'EEXIST' });
  assert.deepEqual(sent, ['PF1', 'PF2']);
  assert.equal(JSON.parse(readFileSync(first, 'utf8')).id, 'PF1');
  assert.equal(JSON.parse(readFileSync(second, 'utf8')).id, 'PF2');
});

test('envio concorrente e repetição após timeout conservam uma única referência e um POST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'multipag-pf-'));
  const file = join(dir, 'estado.json');
  const order = { id: 'PFteste', amountCents: 100, type: 'EMAIL', key: 'teste@example.org',
    date: '2026-11-23', cpf: '00000000000', payer: { conta: '01' } };
  let calls = 0;
  const client = { async createPixTransfer(payload) {
    calls++;
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), order);
    assert.equal(payload.transactionId, order.id);
    assert.equal(payload.amountCents, 100);
    await Promise.resolve();
    throw Error('timeout simulado');
  } };
  try {
    await Promise.all([
      assert.rejects(sendOnce(file, order, client), /timeout simulado/),
      assert.rejects(sendOnce(file, { ...order, id: 'outra' }, client), { code: 'EEXIST' }),
    ]);
    await assert.rejects(sendOnce(file, order, client), { code: 'EEXIST' });
    assert.equal(calls, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
