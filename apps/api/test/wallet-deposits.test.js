import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import { processAsaasWebhook } from "../src/modules/payments/asaas.service.js";
import { ensureUserWallets } from "../src/modules/wallet/wallet.service.js";
import { calculateWalletDepositAmounts } from "../src/modules/wallet-deposits/wallet-deposit.config.js";

const email = "wallet-deposit-test@detudoja.local";
let depositId;
let paymentId;
let userId;

test("deposito desconta somente a taxa Pix fixa, sem pool", () => {
  assert.deepEqual(calculateWalletDepositAmounts(1000), {
    feeCents: 99,
    grossCents: 1000,
    netCents: 901,
  });
  assert.deepEqual(calculateWalletDepositAmounts(100), {
    feeCents: 99,
    grossCents: 100,
    netCents: 1,
  });
});

async function cleanup() {
  const user = await prisma.usuario.findUnique({ select: { id: true }, where: { email } });
  if (!user) return;
  const deposits = await prisma.depositoCarteira.findMany({ select: { pagamento_id: true }, where: { usuario_id: user.id } });
  const paymentIds = deposits.map((deposit) => deposit.pagamento_id);

  await prisma.$transaction(async (database) => {
    if (paymentIds.length) {
      await database.eventoGatewayPagamento.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.depositoCarteira.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.pagamentoComposicao.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.pagamento.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await database.lancamentoCarteira.deleteMany({ where: { usuario_id: user.id } });
    await database.carteira.deleteMany({ where: { usuario_id: user.id } });
    await database.usuario.delete({ where: { id: user.id } });
  });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  const user = await prisma.usuario.create({
    data: {
      cpf: "98765432100",
      email,
      nome: "Teste de Deposito",
      senha_hash: "not-used",
      status: "ATIVO",
      telefone: "11999990123",
    },
  });
  userId = user.id;
  await ensureUserWallets(userId);
  const wallet = await prisma.carteira.findFirstOrThrow({
    where: { usuario_id: userId, tipo_carteira: { codigo: "saldo_pix" } },
  });
  const payment = await prisma.pagamento.create({
    data: {
      gateway: "ASAAS",
      gateway_pagamento_id: "wallet-deposit-test-payment",
      metodo_principal: "PIX",
      status: "AGUARDANDO_PAGAMENTO",
      usuario_pagador_id: userId,
      valor_pago_pix_centavos: 2500n,
      valor_total_centavos: 2500n,
      composicoes: { create: { status: "PENDENTE", tipo_origem: "PIX", valor_centavos: 2500n } },
      deposito_carteira: {
        create: {
          carteira_id: wallet.id,
          chave_idempotencia: "wallet-deposit-test-idempotency-key",
          taxa_processamento_centavos: 99n,
          usuario_id: userId,
          valor_centavos: 2500n,
          valor_liquido_centavos: 2401n,
        },
      },
    },
    include: { deposito_carteira: true },
  });
  paymentId = payment.id;
  depositId = payment.deposito_carteira.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("webhook confirma deposito Pix uma unica vez e credita somente Saldo Pix", async () => {
  const payload = {
    event: "PAYMENT_RECEIVED",
    id: "wallet-deposit-test-event-1",
    payment: { id: "wallet-deposit-test-payment" },
  };

  const first = await processAsaasWebhook(payload);
  const replay = await processAsaasWebhook(payload);
  const [deposit, payment, wallet, movements] = await Promise.all([
    prisma.depositoCarteira.findUniqueOrThrow({ where: { id: depositId } }),
    prisma.pagamento.findUniqueOrThrow({ where: { id: paymentId } }),
    prisma.carteira.findFirstOrThrow({ where: { usuario_id: userId, tipo_carteira: { codigo: "saldo_pix" } } }),
    prisma.lancamentoCarteira.findMany({ where: { origem: "DEPOSITO_PIX", origem_id: depositId, usuario_id: userId } }),
  ]);

  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(deposit.status, "CONFIRMADO");
  assert.equal(deposit.taxa_processamento_centavos, 99n);
  assert.equal(deposit.valor_liquido_centavos, 2401n);
  assert.equal(payment.status, "PAGO");
  assert.equal(wallet.saldo_disponivel_centavos, 2401n);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].valor_centavos, 2401n);
});

test("webhook reconcilia deposito por externalReference quando o id Asaas se perdeu", async () => {
  const wallet = await prisma.carteira.findFirstOrThrow({
    where: { usuario_id: userId, tipo_carteira: { codigo: "saldo_pix" } },
  });
  const payment = await prisma.pagamento.create({
    data: {
      gateway: "ASAAS",
      gateway_pagamento_id: null,
      metodo_principal: "PIX",
      status: "EM_RECONCILIACAO",
      usuario_pagador_id: userId,
      valor_pago_pix_centavos: 1500n,
      valor_total_centavos: 1500n,
      composicoes: { create: { status: "PENDENTE", tipo_origem: "PIX", valor_centavos: 1500n } },
      deposito_carteira: {
        create: {
          carteira_id: wallet.id,
          chave_idempotencia: "wallet-deposit-lost-response-key",
          taxa_processamento_centavos: 99n,
          usuario_id: userId,
          valor_centavos: 1500n,
          valor_liquido_centavos: 1401n,
        },
      },
    },
    include: { deposito_carteira: true },
  });
  const gatewayPaymentId = `wallet-deposit-reconciled-${payment.id}`;

  await processAsaasWebhook({
    event: "PAYMENT_RECEIVED",
    id: `wallet-deposit-reconciled-event-${payment.id}`,
    payment: {
      externalReference: `DTJ:WALLET_DEPOSIT:${payment.deposito_carteira.id}`,
      id: gatewayPaymentId,
    },
  });

  const [deposit, persistedPayment, updatedWallet] = await Promise.all([
    prisma.depositoCarteira.findUniqueOrThrow({ where: { id: payment.deposito_carteira.id } }),
    prisma.pagamento.findUniqueOrThrow({ where: { id: payment.id } }),
    prisma.carteira.findFirstOrThrow({
      where: { usuario_id: userId, tipo_carteira: { codigo: "saldo_pix" } },
    }),
  ]);

  assert.equal(deposit.status, "CONFIRMADO");
  assert.equal(persistedPayment.gateway_pagamento_id, gatewayPaymentId);
  assert.equal(persistedPayment.status, "PAGO");
  assert.equal(updatedWallet.saldo_disponivel_centavos, 3802n);
});
