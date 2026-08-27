import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import {
  createStoreQrCharge,
  payChargeWithWallet,
} from "../src/modules/charges/charge.service.js";
import {
  acceptCustomerOrderProposal,
  cancelCustomerOrder,
  createCheckoutOrder,
  createCustomerOrderMessage,
  createOnlineOrderRequest,
  listCustomerOrderMessages,
  payCustomerOrderProposal,
} from "../src/modules/orders/orders.service.js";
import {
  createStoreOrderProposal,
  createStoreOrderMessage,
  listStoreOrderMessages,
} from "../src/modules/seller/seller.service.js";
import { refundAdminPayment } from "../src/modules/admin/admin-payments.service.js";
import {
  createStoreConversationMessage,
  getStoreConversation,
  openStoreConversation,
} from "../src/modules/store-chats/store-chats.service.js";
import {
  creditUserWallet,
  ensureUserWallets,
} from "../src/modules/wallet/wallet.service.js";

const marker = "audit-business-flow";
const state = {};

async function cleanup() {
  const users = await prisma.usuario.findMany({
    select: { id: true },
    where: { email: { endsWith: `@${marker}.local` } },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) return;

  const stores = await prisma.loja.findMany({
    select: { id: true },
    where: { lojista: { usuario_id: { in: userIds } } },
  });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.pedidoLoja.findMany({
    select: { id: true, pagamento_id: true },
    where: {
      OR: [
        { usuario_id: { in: userIds } },
        ...(storeIds.length ? [{ loja_id: { in: storeIds } }] : []),
      ],
    },
  });
  const orderIds = orders.map((order) => order.id);
  const charges = await prisma.cobranca.findMany({
    select: { id: true, pagamento_id: true },
    where: {
      OR: [
        { criador_usuario_id: { in: userIds } },
        ...(storeIds.length ? [{ loja_id: { in: storeIds } }] : []),
      ],
    },
  });
  const paymentIds = [...new Set([
    ...orders.map((order) => order.pagamento_id),
    ...charges.map((charge) => charge.pagamento_id),
  ].filter(Boolean))];
  const transactions = paymentIds.length
    ? await prisma.transacaoComercial.findMany({
        select: { id: true },
        where: { pagamento_id: { in: paymentIds } },
      })
    : [];
  const transactionIds = transactions.map((transaction) => transaction.id);

  await prisma.$transaction(async (database) => {
    if (transactionIds.length) {
      await database.eventoFinanceiro.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.documentoFiscal.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.lancamentoPlataforma.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.recompensa.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.recebivel.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.transacaoComercial.deleteMany({ where: { id: { in: transactionIds } } });
    }
    if (orderIds.length) {
      await database.pedidoLojaMensagem.deleteMany({ where: { pedido_id: { in: orderIds } } });
      await database.propostaPedidoLoja.deleteMany({ where: { pedido_id: { in: orderIds } } });
      await database.pedidoLojaItem.deleteMany({ where: { pedido_id: { in: orderIds } } });
      await database.pedidoLoja.deleteMany({ where: { id: { in: orderIds } } });
    }
    await database.cobranca.deleteMany({ where: { id: { in: charges.map((charge) => charge.id) } } });
    if (paymentIds.length) {
      await database.eventoFinanceiro.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.eventoGatewayPagamento.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.comprovantePagamento.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.pagamentoComposicao.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.pagamentoItem.deleteMany({ where: { pagamento_id: { in: paymentIds } } });
      await database.pagamento.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await database.conversaLojaMensagem.deleteMany({
      where: { conversa: { cliente_usuario_id: { in: userIds } } },
    });
    await database.conversaLoja.deleteMany({ where: { cliente_usuario_id: { in: userIds } } });
    if (storeIds.length) {
      await database.produtoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
      await database.loja.deleteMany({ where: { id: { in: storeIds } } });
    }
    await database.lancamentoCarteira.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.carteira.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.lojista.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.usuario.deleteMany({ where: { id: { in: userIds } } });
    await database.segmentoVenda.deleteMany({ where: { slug: `${marker}-segment` } });
    await database.categoriaLoja.deleteMany({ where: { nome: `${marker}-category` } });
  });
}

before(async () => {
  await prisma.$connect();
  await cleanup();

  const [seller, buyer, outsider] = await Promise.all([
    prisma.usuario.create({
      data: {
        cpf: "39053344705",
        email: `seller@${marker}.local`,
        nome: "Audit Seller",
        senha_hash: "not-used-by-business-flow-tests",
        status: "ATIVO",
        telefone: "11910000001",
      },
    }),
    prisma.usuario.create({
      data: {
        cpf: "86288366757",
        email: `buyer@${marker}.local`,
        nome: "Audit Buyer",
        senha_hash: "not-used-by-business-flow-tests",
        status: "ATIVO",
        telefone: "11910000002",
      },
    }),
    prisma.usuario.create({
      data: {
        cpf: "15350946056",
        email: `outsider@${marker}.local`,
        nome: "Audit Outsider",
        senha_hash: "not-used-by-business-flow-tests",
        status: "ATIVO",
        telefone: "11910000003",
      },
    }),
  ]);
  const category = await prisma.categoriaLoja.create({
    data: { nome: `${marker}-category`, status: "ATIVA" },
  });
  const segment = await prisma.segmentoVenda.create({
    data: {
      categoria_loja_id: category.id,
      nome: `${marker}-segment`,
      slug: `${marker}-segment`,
      status: "ATIVO",
      taxa_plataforma_percentual: 10,
    },
  });
  const merchant = await prisma.lojista.create({
    data: {
      cpf: seller.cpf,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: seller.id,
    },
  });
  const store = await prisma.loja.create({
    data: {
      aceita_pagamento_online: true,
      aceita_qrcode: true,
      aberta_para_pedidos: true,
      categoria_id: category.id,
      lojista_id: merchant.id,
      nome: "Audit Store",
      segmento_venda_id: segment.id,
      slug: `${marker}-store`,
      status: "ATIVA",
      visivel_no_app: true,
    },
  });
  const product = await prisma.produtoLoja.create({
    data: {
      aceita_entrega: true,
      aceita_retirada: true,
      estoque_controlado: true,
      estoque_quantidade: 100,
      loja_id: store.id,
      nome: "Audit Product",
      preco_centavos: 1000,
      status: "ATIVO",
    },
  });

  await ensureUserWallets(buyer.id);
  await creditUserWallet({
    description: "Saldo isolado para testes de fluxo de negocio.",
    origin: "AJUSTE_ADMIN",
    originId: null,
    userId: buyer.id,
    valueCents: 10000,
    walletCode: "saldo_pix",
  });

  Object.assign(state, { buyer, outsider, product, segment, seller, store });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("store chat persists both sides and blocks an unrelated user", async () => {
  const opened = await openStoreConversation(state.buyer.id, state.store.id);
  await createStoreConversationMessage(state.buyer.id, opened.conversation.id, {
    message: "Mensagem do comprador",
  });

  await assert.rejects(
    getStoreConversation(state.outsider.id, opened.conversation.id),
    (error) => error.statusCode === 403,
  );

  const sellerView = await getStoreConversation(state.seller.id, opened.conversation.id);
  assert.equal(sellerView.conversation.messages.at(-1).text, "Mensagem do comprador");

  await createStoreConversationMessage(state.seller.id, opened.conversation.id, {
    message: "Resposta da loja",
  });
  const buyerView = await getStoreConversation(state.buyer.id, opened.conversation.id);
  assert.equal(buyerView.conversation.messages.at(-1).text, "Resposta da loja");
  assert.equal(buyerView.conversation.unreadCount, 0);
});

test("wallet checkout creates an order chat visible only to buyer and store", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1000, useBalance: true },
    storeId: state.store.id,
  });
  const orderId = created.order.id;

  await createCustomerOrderMessage(state.buyer.id, orderId, {
    message: "Duvida do pedido",
  });
  await createStoreOrderMessage(state.seller.id, state.store.id, orderId, {
    message: "Resposta no pedido",
  });

  const buyerMessages = await listCustomerOrderMessages(state.buyer.id, orderId);
  const sellerMessages = await listStoreOrderMessages(state.seller.id, state.store.id, orderId);

  assert.equal(created.order.payment.status, "PAGO");
  assert.equal(buyerMessages.messages.at(-1).text, "Resposta no pedido");
  assert.equal(sellerMessages.messages.at(-1).text, "Resposta no pedido");
  await assert.rejects(
    listCustomerOrderMessages(state.outsider.id, orderId),
    (error) => error.statusCode === 404,
  );
});

test("the same idempotency key creates one checkout and reserves stock once", async () => {
  await prisma.segmentoVenda.update({
    data: { negocia_pedido_por_chat: false },
    where: { id: state.segment.id },
  });
  const idempotencyKey = `checkout-test-${Date.now()}`;
  const stockBefore = await prisma.produtoLoja.findUnique({
    select: { estoque_quantidade: true },
    where: { id: state.product.id },
  });
  const payload = {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1000, useBalance: true },
    storeId: state.store.id,
  };
  const attempts = await Promise.all([
    createCheckoutOrder(state.buyer.id, payload, { idempotencyKey }),
    createCheckoutOrder(state.buyer.id, payload, { idempotencyKey }),
  ]);
  const [orders, stockAfter] = await Promise.all([
    prisma.pedidoLoja.findMany({
      where: { chave_idempotencia: idempotencyKey, usuario_id: state.buyer.id },
    }),
    prisma.produtoLoja.findUnique({
      select: { estoque_quantidade: true },
      where: { id: state.product.id },
    }),
  ]);

  assert.equal(orders.length, 1);
  assert.equal(attempts[0].order.id, attempts[1].order.id);
  assert.equal(Number(stockAfter.estoque_quantidade), Number(stockBefore.estoque_quantidade) - 1);
});

test("canceling an unpaid chat order restores its reserved stock once", async () => {
  await prisma.segmentoVenda.update({
    data: { negocia_pedido_por_chat: true },
    where: { id: state.segment.id },
  });
  const stockBefore = await prisma.produtoLoja.findUnique({
    select: { estoque_quantidade: true },
    where: { id: state.product.id },
  });
  const created = await createOnlineOrderRequest(
    state.buyer.id,
    {
      address: null,
      addressId: null,
      deliveryMode: "pickup",
      items: [{ notes: "", productId: state.product.id, quantity: 1 }],
      storeId: state.store.id,
    },
    { idempotencyKey: `chat-stock-${Date.now()}` },
  );
  const afterReservation = await prisma.produtoLoja.findUnique({
    select: { estoque_quantidade: true },
    where: { id: state.product.id },
  });
  await cancelCustomerOrder(state.buyer.id, created.order.id);
  await cancelCustomerOrder(state.buyer.id, created.order.id);
  const afterCancellation = await prisma.produtoLoja.findUnique({
    select: { estoque_quantidade: true },
    where: { id: state.product.id },
  });

  assert.equal(Number(afterReservation.estoque_quantidade), Number(stockBefore.estoque_quantidade) - 1);
  assert.equal(Number(afterCancellation.estoque_quantidade), Number(stockBefore.estoque_quantidade));
  await prisma.segmentoVenda.update({
    data: { negocia_pedido_por_chat: false },
    where: { id: state.segment.id },
  });
});

test("checkout never confirms Pix internally when the Asaas gateway is unavailable", async () => {
  const paymentsBefore = await prisma.pagamento.count({
    where: {
      loja_id: state.store.id,
      usuario_pagador_id: state.buyer.id,
    },
  });

  await assert.rejects(
    createCheckoutOrder(state.buyer.id, {
      address: null,
      addressId: null,
      deliveryMode: "pickup",
      items: [{ notes: "", productId: state.product.id, quantity: 1 }],
      payment: { balanceUsedCents: 0, useBalance: false },
      storeId: state.store.id,
    }),
    (error) => error.statusCode === 503,
  );

  const paymentsAfter = await prisma.pagamento.count({
    where: {
      loja_id: state.store.id,
      usuario_pagador_id: state.buyer.id,
    },
  });

  assert.equal(paymentsAfter, paymentsBefore);
});

test("chat proposal never confirms Pix internally when the Asaas gateway is unavailable", async () => {
  await prisma.segmentoVenda.update({
    data: { negocia_pedido_por_chat: true },
    where: { id: state.segment.id },
  });
  const requested = await createOnlineOrderRequest(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    storeId: state.store.id,
  });
  const proposed = await createStoreOrderProposal(
    state.seller.id,
    state.store.id,
    requested.order.id,
    { amountCents: 1000, description: "Proposta Pix segura" },
  );
  await acceptCustomerOrderProposal(state.buyer.id, requested.order.id, proposed.proposal.id);

  await assert.rejects(
    payCustomerOrderProposal(
      state.buyer.id,
      requested.order.id,
      proposed.proposal.id,
      { balanceUsedCents: 0, useBalance: false },
    ),
    (error) => error.statusCode === 503,
  );

  const persisted = await prisma.pedidoLoja.findUnique({
    include: { propostas: true },
    where: { id: requested.order.id },
  });

  assert.equal(persisted.pagamento_id, null);
  assert.equal(persisted.status, "AGUARDANDO_PAGAMENTO");
  assert.equal(persisted.propostas[0].status, "ACEITA");
});

test("two simultaneous attempts can claim the same QR charge only once", async () => {
  const created = await createStoreQrCharge(state.seller.id, state.store.id, {
    amountCents: 1000,
    description: "Concurrent payment test",
    title: "Concurrent payment test",
  });
  const attempts = await Promise.allSettled([
    payChargeWithWallet(state.buyer.id, created.charge.code),
    payChargeWithWallet(state.buyer.id, created.charge.code),
  ]);
  const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");
  const persisted = await prisma.cobranca.findUnique({
    include: { pagamento: true },
    where: { id: created.charge.id },
  });

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(persisted.status, "PAGA");
  assert.equal(persisted.pagamento.status, "PAGO");
});

test("admin refund reverses the buyer return and every settled earning", async () => {
  const created = await createStoreQrCharge(state.seller.id, state.store.id, {
    amountCents: 1000,
    description: "Refund settlement test",
    title: "Refund settlement test",
  });
  const paid = await payChargeWithWallet(state.buyer.id, created.charge.code);
  const paymentId = paid.charge.payment.id;
  const transactionBefore = await prisma.transacaoComercial.findUnique({
    include: {
      lancamentos_plataforma: true,
      recebiveis: true,
      recompensas: true,
    },
    where: { pagamento_id: paymentId },
  });

  assert.equal(transactionBefore.status, "LIQUIDADA");
  assert.ok(transactionBefore.recompensas.length > 0);
  assert.ok(transactionBefore.recebiveis.length > 0);

  await refundAdminPayment(1, paymentId, {
    reason: "Cliente solicitou cancelamento dentro da politica de teste.",
  });

  const [payment, transactionAfter, reversalEntries] = await Promise.all([
    prisma.pagamento.findUnique({ where: { id: paymentId } }),
    prisma.transacaoComercial.findUnique({
      include: { recebiveis: true, recompensas: true },
      where: { pagamento_id: paymentId },
    }),
    prisma.lancamentoCarteira.findMany({
      where: {
        origem: "ESTORNO",
        origem_id: transactionBefore.id,
        tipo_lancamento: "DEBITO",
      },
    }),
  ]);

  assert.equal(payment.status, "ESTORNADO");
  assert.equal(transactionAfter.status, "ESTORNADA");
  assert.ok(transactionAfter.recompensas.every((reward) => reward.status === "ESTORNADA"));
  assert.ok(transactionAfter.recebiveis.every((receivable) => receivable.status === "ESTORNADO"));
  assert.ok(reversalEntries.length >= 2);
});
