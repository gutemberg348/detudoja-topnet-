import assert from 'node:assert/strict';
import test from 'node:test';
import { withdrawalRepository } from '../src/modules/withdrawals/withdrawal.repository.js';
import { payoutRepository } from '../src/modules/payouts/payout.repository.js';
import { cancelWithdrawal, rejectWithdrawal, submitApprovedWithdrawal } from '../src/modules/withdrawals/withdrawal.service.js';
import { submitPendingPayout } from '../src/modules/payouts/payout.service.js';

test('cancelar ou recusar nao devolve reserva se envio iniciou entre as leituras', async (t) => {
  t.mock.method(withdrawalRepository, 'findWithdrawal', async () => ({ id: 7, usuario_id: 3, status: 'SOLICITADO' }));
  t.mock.method(withdrawalRepository, 'findWithdrawalUnique', async () => ({ id: 7, status: 'APROVADO' }));
  let mutations = 0;
  t.mock.method(withdrawalRepository, 'transaction', async (work) => work({
    saque: {
      findUnique: async () => ({ id: 7, status: 'PROCESSANDO' }),
      updateMany: async () => { mutations++; throw new Error('nao pode cancelar envio iniciado'); },
    },
  }));
  await assert.rejects(cancelWithdrawal(3, 7), /alterado por outra operacao/);
  await assert.rejects(rejectWithdrawal(1, 7, 'cancelar'), /alterado por outra operacao/);
  assert.equal(mutations, 0);
});

test('saque desabilitado continua aprovado sem chamar banco ou trocar gateway', async (t) => {
  t.mock.method(withdrawalRepository, 'findWithdrawalUnique', async () => ({ id: 7, status: 'APROVADO', gateway: 'SICREDI' }));
  t.mock.method(withdrawalRepository, 'updateWithdrawals', async () => assert.fail('nao deve assumir envio'));
  assert.equal(await submitApprovedWithdrawal(7, {
    gatewayEnabled: (record) => { assert.equal(record.gateway, 'SICREDI'); return false; },
    sendTransfer: async () => assert.fail('nao deve enviar'),
  }), null);
});

test('duas tentativas de saque enviam uma vez e timeout nao permite reenvio', async (t) => {
  const state = { id: 7, status: 'APROVADO', gateway: 'SICREDI' };
  t.mock.method(withdrawalRepository, 'findWithdrawalUnique', async () => ({ ...state }));
  t.mock.method(withdrawalRepository, 'updateWithdrawals', async ({ where, data }) => {
    const accepted = typeof where.status === 'string' ? state.status === where.status : where.status.in.includes(state.status);
    if (!accepted) return { count: 0 };
    Object.assign(state, data); return { count: 1 };
  });
  let sends = 0;
  const dependencies = { gatewayEnabled: () => true, sendTransfer: async () => { sends++; throw new Error('timeout'); } };
  await Promise.all([submitApprovedWithdrawal(7, dependencies), submitApprovedWithdrawal(7, dependencies)]);
  await submitApprovedWithdrawal(7, dependencies);
  assert.equal(sends, 1);
  assert.equal(state.status, 'EM_RECONCILIACAO');
});

test('repasse indisponivel nao devolve saldo quando outro processo ganhou o envio', async (t) => {
  t.mock.method(payoutRepository, 'findPayout', async () => ({ id: 7, status: 'PENDENTE', gateway: 'SICREDI' }));
  t.mock.method(payoutRepository, 'updatePayouts', async () => ({ count: 0 }));
  t.mock.method(payoutRepository, 'transaction', async () => assert.fail('nao pode devolver reserva de outro processo'));
  assert.equal(await submitPendingPayout(7, { gatewayEnabled: () => false, sendTransfer: async () => assert.fail('nao deve enviar') }), null);
});

test('worker de repasses com gateway desligado nunca chama o banco', async (t) => {
  t.mock.method(payoutRepository, 'findPayout', async () => ({ id: 7, status: 'PENDENTE', gateway: 'SICREDI' }));
  t.mock.method(payoutRepository, 'updatePayouts', async ({ where }) => { assert.equal(where.status, 'PENDENTE'); return { count: 1 }; });
  // A concurrent terminal transition also must not restore twice.
  let transactions = 0;
  t.mock.method(payoutRepository, 'transaction', async (work) => {
    transactions++;
    return work({ repassePix: { findUnique: async () => ({ id: 7, status: 'FALHOU' }) } });
  });
  await submitPendingPayout(7, { gatewayEnabled: () => false, sendTransfer: async () => assert.fail('nao deve enviar') });
  assert.equal(transactions, 1);
});

test('repasse com resposta perdida nao repete POST em novas tentativas', async (t) => {
  const state = { id: 7, status: 'PENDENTE', gateway: 'SICREDI' };
  t.mock.method(payoutRepository, 'findPayout', async () => ({ ...state }));
  t.mock.method(payoutRepository, 'updatePayouts', async ({ where, data }) => {
    const accepted = typeof where.status === 'string' ? state.status === where.status : where.status.in.includes(state.status);
    if (!accepted) return { count: 0 };
    Object.assign(state, data); return { count: 1 };
  });
  let sends = 0;
  const dependencies = { gatewayEnabled: () => true, sendTransfer: async () => { sends++; throw new Error('timeout'); } };
  await Promise.all([submitPendingPayout(7, dependencies), submitPendingPayout(7, dependencies)]);
  await submitPendingPayout(7, dependencies);
  assert.equal(sends, 1);
  assert.equal(state.status, 'EM_RECONCILIACAO');
});
