import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";
import {
  createStoreQrCharge,
  payChargeWithWallet,
} from "../src/modules/charges/charge.service.js";
import { createStoreChargeSchema } from "../src/modules/charges/charge.validator.js";
import {
  acceptCustomerOrderProposal,
  cancelCustomerOrder,
  completeCustomerOrder,
  createCheckoutOrder,
  createCustomerOrderMessage,
  createOnlineOrderRequest,
  listCustomerOrderMessages,
  payCustomerOrderProposal,
} from "../src/modules/orders/orders.service.js";
import { expireUnattendedStoreOrders } from "../src/modules/orders/order-timeout.service.js";
import {
  createStoreOrderProposal,
  createStoreOrderMessage,
  createAutonomousSale,
  listStoreOrderMessages,
  updateStoreProduct,
  updateStoreOrderStatus,
} from "../src/modules/seller/seller.service.js";
import { refundAdminPayment } from "../src/modules/admin/admin-payments.service.js";
import { releaseCommercialSettlement } from "../src/modules/earnings/earnings-release.service.js";
import { processAsaasWebhook } from "../src/modules/payments/asaas.service.js";
import {
  processAsaasTransferWebhook,
  savePayoutAccount,
} from "../src/modules/payouts/payout.service.js";
import {
  assertPaymentMonthlyCpfLimit,
  assertSellerMonthlyCpfLimit,
  assertStoreMonthlyCpfLimit,
} from "../src/modules/earnings/commercial-limit.service.js";
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

async function movePickupOrderToReady(orderId) {
  for (const status of ["ACEITO", "PREPARANDO", "PRONTO_RETIRADA"]) {
    await updateStoreOrderStatus(state.seller.id, state.store.id, orderId, status);
  }
}

async function moveDeliveryOrderToSent(orderId) {
  for (const status of ["ACEITO", "PREPARANDO", "SAIU_ENTREGA"]) {
    await updateStoreOrderStatus(state.seller.id, state.store.id, orderId, status);
  }
}

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
  const sellers = await prisma.vendedor.findMany({
    select: { id: true },
    where: { usuario_id: { in: userIds } },
  });
  const sellerIds = sellers.map((seller) => seller.id);
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
      await database.repassePix.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
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
    if (sellerIds.length) {
      await database.vendaAutonoma.deleteMany({ where: { vendedor_id: { in: sellerIds } } });
    }
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
    await database.contaBancaria.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.lojista.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.vendedor.deleteMany({ where: { usuario_id: { in: userIds } } });
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
  await prisma.$transaction([
    prisma.kycUsuario.create({
      data: {
        cpf: seller.cpf,
        nome_completo: seller.nome,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        usuario_id: seller.id,
        validado_em: new Date(),
      },
    }),
    prisma.usuario.update({
      data: { nivel_kyc: "TIER_2" },
      where: { id: seller.id },
    }),
  ]);
  const merchant = await prisma.lojista.create({
    data: {
      cpf: seller.cpf,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: seller.id,
    },
  });
  const sellerProfile = await prisma.vendedor.create({
    data: {
      cpf: seller.cpf,
      nome_publico: "Audit Seller",
      segmento_venda_id: segment.id,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: seller.id,
    },
  });
  await prisma.contaBancaria.create({
    data: {
      chave_pix: seller.cpf,
      documento_titular: seller.cpf,
      nome_titular: seller.nome,
      principal: true,
      status: "ATIVA",
      tipo_chave: "CPF",
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
    valueCents: 100000,
    walletCode: "saldo_pix",
  });

  Object.assign(state, { buyer, outsider, product, segment, seller, sellerProfile, store });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("CPF monthly limit is shared by stores and autonomous sales and reserves pending Asaas Pix", async () => {
  const secondStore = await prisma.loja.create({
    data: {
      aceita_pagamento_online: true,
      aceita_qrcode: true,
      aberta_para_pedidos: true,
      categoria_id: state.store.categoria_id,
      lojista_id: state.store.lojista_id,
      nome: "Audit Second Store",
      segmento_venda_id: state.segment.id,
      slug: `${marker}-second-store`,
      status: "ATIVA",
      visivel_no_app: true,
    },
  });
  const payment = await prisma.pagamento.create({
    data: {
      gateway: "INTERNO",
      loja_id: state.store.id,
      metodo_principal: "SALDO_PIX",
      status: "AGUARDANDO_PAGAMENTO",
      usuario_pagador_id: state.buyer.id,
      valor_pago_saldo_centavos: 450000n,
      valor_total_centavos: 450000n,
    },
  });

  try {
    await assert.doesNotReject(
      prisma.$transaction((database) => assertPaymentMonthlyCpfLimit(database, payment.id)),
    );
    await assert.rejects(
      prisma.$transaction((database) => (
        assertStoreMonthlyCpfLimit(database, secondStore.id, 60000)
      )),
      (error) => error.statusCode === 409,
    );
    await assert.rejects(
      prisma.$transaction((database) => (
        assertSellerMonthlyCpfLimit(database, state.sellerProfile.id, 60000)
      )),
      (error) => error.statusCode === 409,
    );
  } finally {
    await prisma.pagamento.delete({ where: { id: payment.id } });
    await prisma.loja.delete({ where: { id: secondStore.id } });
  }
});

test("store chat persists both sides and blocks an unrelated user", async () => {
  await assert.rejects(
    openStoreConversation(state.seller.id, state.store.id),
    (error) => error.statusCode === 409
      && error.message.includes("vinculada a sua conta"),
  );

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

test("store owner and active members cannot buy from their own store", async () => {
  const directCheckout = {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Self purchase guard", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  };
  const originalSegment = await prisma.segmentoVenda.findUniqueOrThrow({
    select: { negocia_pedido_por_chat: true },
    where: { id: state.segment.id },
  });

  await assert.rejects(
    () => createCheckoutOrder(state.seller.id, directCheckout),
    (error) => error?.statusCode === 403 && error.message.includes("vinculada a sua conta"),
  );

  const member = await prisma.usuarioLoja.create({
    data: { cargo: "ATENDENTE", loja_id: state.store.id, usuario_id: state.outsider.id },
  });
  try {
    await assert.rejects(
      () => createCheckoutOrder(state.outsider.id, directCheckout),
      (error) => error?.statusCode === 403 && error.message.includes("vinculada a sua conta"),
    );

    await prisma.segmentoVenda.update({
      data: { negocia_pedido_por_chat: true },
      where: { id: state.segment.id },
    });
    await assert.rejects(
      () => createOnlineOrderRequest(state.seller.id, directCheckout),
      (error) => error?.statusCode === 403 && error.message.includes("vinculada a sua conta"),
    );
  } finally {
    await prisma.usuarioLoja.delete({ where: { id: member.id } });
    await prisma.segmentoVenda.update({
      data: originalSegment,
      where: { id: state.segment.id },
    });
  }
});

test("checkout enforces the delivery and pickup modes configured per product", async () => {
  const original = await prisma.produtoLoja.findUniqueOrThrow({
    select: { aceita_entrega: true, aceita_retirada: true },
    where: { id: state.product.id },
  });
  const base = {
    address: {
      bairro: "Centro",
      cep: "58700000",
      cidade: "Patos",
      estado: "PB",
      numero: "10",
      rua: "Rua dos Testes",
    },
    addressId: null,
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  };

  try {
    await prisma.produtoLoja.update({
      data: { aceita_entrega: false, aceita_retirada: true },
      where: { id: state.product.id },
    });
    await assert.rejects(
      createCheckoutOrder(state.buyer.id, { ...base, deliveryMode: "delivery" }),
      (error) => error.statusCode === 409 && error.message.includes("nao aceita entrega"),
    );

    await prisma.produtoLoja.update({
      data: { aceita_entrega: true, aceita_retirada: false },
      where: { id: state.product.id },
    });
    await assert.rejects(
      createCheckoutOrder(state.buyer.id, { ...base, deliveryMode: "pickup" }),
      (error) => error.statusCode === 409 && error.message.includes("nao aceita retirada"),
    );
  } finally {
    await prisma.produtoLoja.update({ data: original, where: { id: state.product.id } });
  }
});

test("partial product edits preserve delivery, price and stock invariants", async () => {
  const original = await prisma.produtoLoja.findUniqueOrThrow({ where: { id: state.product.id } });

  await assert.rejects(
    updateStoreProduct(state.seller.id, state.store.id, state.product.id, {
      acceptDelivery: false,
      acceptPickup: false,
    }),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    updateStoreProduct(state.seller.id, state.store.id, state.product.id, {
      promotionalPriceCents: Number(original.preco_centavos),
    }),
    (error) => error.statusCode === 400,
  );

  await prisma.produtoLoja.update({
    data: { estoque_controlado: false, estoque_quantidade: null },
    where: { id: original.id },
  });
  try {
    await assert.rejects(
      updateStoreProduct(state.seller.id, state.store.id, state.product.id, {
        stockControlled: true,
      }),
      (error) => error.statusCode === 400,
    );
  } finally {
    await prisma.produtoLoja.update({
      data: {
        estoque_controlado: original.estoque_controlado,
        estoque_quantidade: original.estoque_quantidade,
      },
      where: { id: original.id },
    });
  }
});

test("wallet checkout creates an order chat visible only to buyer and store", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
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

test("unattended paid order is canceled and refunded to the original wallet", async () => {
  const productBefore = await prisma.produtoLoja.findUniqueOrThrow({
    select: { estoque_quantidade: true },
    where: { id: state.product.id },
  });
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Automatic timeout", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });
  const walletBefore = await prisma.carteira.findFirstOrThrow({
    where: { usuario_id: state.buyer.id, tipo_carteira: { codigo: "saldo_pix" } },
  });
  const now = new Date();

  await prisma.pagamento.update({
    data: { pago_em: new Date(now.getTime() - (61 * 60 * 1_000)) },
    where: { id: created.order.payment.id },
  });
  const result = await expireUnattendedStoreOrders({ now });
  const [order, payment, productAfter, walletAfter] = await Promise.all([
    prisma.pedidoLoja.findUniqueOrThrow({ where: { id: created.order.id } }),
    prisma.pagamento.findUniqueOrThrow({ where: { id: created.order.payment.id } }),
    prisma.produtoLoja.findUniqueOrThrow({
      select: { estoque_quantidade: true },
      where: { id: state.product.id },
    }),
    prisma.carteira.findFirstOrThrow({
      where: { usuario_id: state.buyer.id, tipo_carteira: { codigo: "saldo_pix" } },
    }),
  ]);

  assert.equal(result.canceled, 1);
  assert.equal(order.status, "CANCELADO");
  assert.equal(payment.status, "ESTORNADO");
  assert.equal(productAfter.estoque_quantidade, productBefore.estoque_quantidade);
  assert.equal(
    walletAfter.saldo_disponivel_centavos,
    walletBefore.saldo_disponivel_centavos + BigInt(created.order.totalCents),
  );
});

test("accepted order without preparation also expires and refunds safely", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Accepted timeout", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });
  await updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "ACEITO");
  const now = new Date();
  const expiredAt = new Date(now.getTime() - (61 * 60 * 1_000));

  await prisma.$transaction([
    prisma.pagamento.update({
      data: { pago_em: expiredAt },
      where: { id: created.order.payment.id },
    }),
    prisma.pedidoLoja.update({
      data: { aceito_em: expiredAt },
      where: { id: created.order.id },
    }),
  ]);

  const result = await expireUnattendedStoreOrders({ now });
  const [order, payment] = await Promise.all([
    prisma.pedidoLoja.findUniqueOrThrow({ where: { id: created.order.id } }),
    prisma.pagamento.findUniqueOrThrow({ where: { id: created.order.payment.id } }),
  ]);

  assert.equal(result.canceled, 1);
  assert.equal(order.status, "CANCELADO");
  assert.equal(payment.status, "ESTORNADO");
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
    payment: { balanceUsedCents: 1099, useBalance: true },
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

test("payout key is never activated without an Asaas ownership lookup", async () => {
  const before = await prisma.contaBancaria.findFirst({
    where: { principal: true, usuario_id: state.seller.id },
  });

  await assert.rejects(
    () => savePayoutAccount(state.seller.id, {
      holderDocument: state.seller.cpf,
      holderName: state.seller.nome,
      key: state.seller.cpf,
      keyType: "CPF",
    }),
    (error) => error.statusCode === 503,
  );

  const after = await prisma.contaBancaria.findUnique({ where: { id: before.id } });
  assert.equal(after.status, before.status);
  assert.equal(after.validado_em, before.validado_em);
});

test("payout key becomes active only after the Asaas holder data matches", async () => {
  const previousEnabled = env.asaas.enabled;
  const previousApiKey = env.asaas.apiKey;
  const previousFetch = globalThis.fetch;

  env.asaas.enabled = true;
  env.asaas.apiKey = "test-asaas-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    cpfCnpj: state.seller.cpf,
    ownerName: state.seller.nome,
  }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

  try {
    const result = await savePayoutAccount(state.seller.id, {
      holderDocument: state.seller.cpf,
      holderName: state.seller.nome,
      key: state.seller.cpf,
      keyType: "CPF",
    });

    assert.equal(result.account.status, "ATIVA");
    assert.equal(result.account.holderName, state.seller.nome);
    assert.equal(result.account.validationProvider, "ASAAS");
    assert.ok(result.account.validatedAt);
  } finally {
    env.asaas.enabled = previousEnabled;
    env.asaas.apiKey = previousApiKey;
    globalThis.fetch = previousFetch;
  }
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

test("store can create a fast in-person charge with only the amount", async () => {
  const payload = createStoreChargeSchema.parse({
    amountCents: 1350,
    description: "",
    title: "",
  });
  const created = await createStoreQrCharge(state.seller.id, state.store.id, payload);

  assert.equal(created.charge.amountCents, 1350);
  assert.equal(created.charge.merchant.id, state.store.id);
  assert.equal(created.charge.origin, "PRESENCIAL");
  assert.equal(created.charge.title, `Compra em ${state.store.nome}`);
  assert.equal(created.charge.localRewardPolicy.processingCovered, true);
  assert.equal(created.charge.localRewardPolicy.priorityCashbackCents, 36);
  assert.equal(created.charge.localRewardPolicy.cashbackStartsAtCents, 995);
});

test("store QR settles immediately and reserves a Pix payout for the merchant", async () => {
  const created = await createStoreQrCharge(state.seller.id, state.store.id, {
    amountCents: 1000,
    description: "Immediate store QR payout",
    title: "Immediate store QR payout",
  });
  const paid = await payChargeWithWallet(state.buyer.id, created.charge.code);
  const transaction = await prisma.transacaoComercial.findUnique({
    include: { recebiveis: true, recompensas: true, repasse_pix: true },
    where: { pagamento_id: paid.charge.payment.id },
  });

  assert.equal(transaction.status, "LIQUIDADA");
  assert.equal(Number(transaction.taxa_processamento_centavos), 99);
  assert.equal(Number(transaction.cashback_prioritario_centavos), 1);
  assert.equal(
    transaction.recompensas.reduce((total, reward) => total + Number(reward.valor_centavos), 0),
    1,
  );
  assert.ok(transaction.recompensas.every((reward) => reward.status === "LIBERADA"));
  assert.equal(transaction.repasse_pix.usuario_id, state.seller.id);
  assert.equal(transaction.repasse_pix.status, "FALHOU");
});

test("completed marketplace order holds merchant and rewards for 24 hours", async () => {
  await prisma.segmentoVenda.update({
    data: { negocia_pedido_por_chat: false },
    where: { id: state.segment.id },
  });
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });

  await movePickupOrderToReady(created.order.id);
  await completeCustomerOrder(state.buyer.id, created.order.id);

  const transaction = await prisma.transacaoComercial.findUnique({
    include: { recebiveis: true, recompensas: true },
    where: { pagamento_id: created.order.payment.id },
  });

  assert.equal(transaction.status, "VALIDADA");
  assert.equal(Number(transaction.taxa_processamento_centavos), 99);
  assert.equal(Number(transaction.cashback_prioritario_centavos), 0);
  assert.equal(created.order.serviceFeeCents, 99);
  assert.equal(created.order.totalCents, created.order.subtotalCents + 99);
  assert.ok(transaction.recebiveis.every((receivable) => receivable.status === "PENDENTE"));
  assert.ok(transaction.recompensas.every((reward) => reward.status === "PENDENTE"));
});

test("store delivery fee goes entirely to the merchant and stays outside commission", async () => {
  await prisma.loja.update({
    data: { taxa_entrega_centavos: 790 },
    where: { id: state.store.id },
  });
  const created = await createCheckoutOrder(state.buyer.id, {
    address: {
      bairro: "Centro",
      cep: "58700000",
      cidade: "Patos",
      complemento: "",
      estado: "PB",
      numero: "10",
      referencia: "",
      rua: "Rua de teste",
    },
    addressId: null,
    deliveryMode: "delivery",
    items: [{ notes: "", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1889, useBalance: true },
    storeId: state.store.id,
  });

  await moveDeliveryOrderToSent(created.order.id);
  await completeCustomerOrder(state.buyer.id, created.order.id);

  const transaction = await prisma.transacaoComercial.findUniqueOrThrow({
    include: { recebiveis: true },
    where: { pagamento_id: created.order.payment.id },
  });
  const merchantReceivable = transaction.recebiveis.find(
    (receivable) => receivable.tipo_recebedor === "LOJISTA",
  );

  assert.equal(created.order.deliveryFeeCents, 790);
  assert.equal(created.order.serviceFeeCents, 99);
  assert.equal(Number(transaction.base_comissao_centavos), 1000);
  assert.equal(Number(transaction.valor_entrega_lojista_centavos), 790);
  assert.equal(Number(transaction.valor_bruto_centavos), 1790);
  assert.equal(Number(transaction.taxa_plataforma_centavos), 100);
  assert.equal(Number(transaction.valor_liquido_lojista_centavos), 1690);
  assert.equal(Number(merchantReceivable.valor_liquido_centavos), 1690);
});

test("Asaas payment confirmation leaves the order received until the store accepts it", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Asaas acceptance guard", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });
  const gatewayPaymentId = `order-status-guard-${created.order.payment.id}`;

  await prisma.$transaction([
    prisma.pagamento.update({
      data: {
        gateway: "ASAAS",
        gateway_pagamento_id: gatewayPaymentId,
        pago_em: null,
        status: "AGUARDANDO_PAGAMENTO",
      },
      where: { id: created.order.payment.id },
    }),
    prisma.pedidoLoja.update({
      data: { aceito_em: null, status: "AGUARDANDO_PAGAMENTO" },
      where: { id: created.order.id },
    }),
  ]);

  await processAsaasWebhook({
    event: "PAYMENT_RECEIVED",
    id: `order-status-guard-event-${created.order.payment.id}`,
    payment: { id: gatewayPaymentId },
  });

  const [order, message] = await Promise.all([
    prisma.pedidoLoja.findUniqueOrThrow({ where: { id: created.order.id } }),
    prisma.pedidoLojaMensagem.findFirstOrThrow({
      orderBy: { criado_em: "desc" },
      where: { pedido_id: created.order.id },
    }),
  ]);

  assert.equal(order.status, "RECEBIDO");
  assert.equal(order.aceito_em, null);
  assert.match(message.mensagem, /Aguarde a loja aceitar/i);
});

test("webhook reconciles an Asaas Pix payment by external reference after a lost create response", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Lost Asaas response", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });
  const gatewayPaymentId = `reconciled-payment-${created.order.payment.id}`;

  await prisma.$transaction([
    prisma.pagamento.update({
      data: {
        gateway: "ASAAS",
        gateway_pagamento_id: null,
        pago_em: null,
        status: "EM_RECONCILIACAO",
      },
      where: { id: created.order.payment.id },
    }),
    prisma.pedidoLoja.update({
      data: { aceito_em: null, status: "AGUARDANDO_PAGAMENTO" },
      where: { id: created.order.id },
    }),
  ]);

  await processAsaasWebhook({
    event: "PAYMENT_RECEIVED",
    id: `reconciled-payment-event-${created.order.payment.id}`,
    payment: {
      externalReference: `DTJ:PAYMENT:${created.order.payment.id}`,
      id: gatewayPaymentId,
    },
  });

  const [order, payment] = await Promise.all([
    prisma.pedidoLoja.findUniqueOrThrow({ where: { id: created.order.id } }),
    prisma.pagamento.findUniqueOrThrow({ where: { id: created.order.payment.id } }),
  ]);

  assert.equal(order.status, "RECEBIDO");
  assert.equal(payment.gateway_pagamento_id, gatewayPaymentId);
  assert.equal(payment.status, "PAGO");
});

test("transfer webhook reconciles a Pix payout by external reference without a stored transfer id", async () => {
  const created = await createStoreQrCharge(state.seller.id, state.store.id, {
    amountCents: 1000,
    description: "Lost payout response",
    title: "Lost payout response",
  });
  const paid = await payChargeWithWallet(state.buyer.id, created.charge.code);
  const transaction = await prisma.transacaoComercial.findUniqueOrThrow({
    include: { repasse_pix: true },
    where: { pagamento_id: paid.charge.payment.id },
  });
  const transferId = `reconciled-transfer-${transaction.repasse_pix.id}`;

  await prisma.repassePix.update({
    data: {
      gateway_transferencia_id: null,
      status: "EM_RECONCILIACAO",
    },
    where: { id: transaction.repasse_pix.id },
  });

  await processAsaasTransferWebhook({
    event: "TRANSFER_DONE",
    id: `reconciled-transfer-event-${transaction.repasse_pix.id}`,
    transfer: {
      externalReference: transaction.repasse_pix.referencia_externa,
      id: transferId,
    },
  });

  const payout = await prisma.repassePix.findUniqueOrThrow({
    where: { id: transaction.repasse_pix.id },
  });
  assert.equal(payout.gateway_transferencia_id, transferId);
  assert.equal(payout.status, "PAGO");
});

test("store orders only advance through the next permitted status", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Status transition guard", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });

  await assert.rejects(
    () => updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "PRONTO_RETIRADA"),
    (error) => error?.statusCode === 409,
  );

  const concurrentAdvance = await Promise.allSettled([
    updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "ACEITO"),
    updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "ACEITO"),
  ]);
  assert.equal(concurrentAdvance.filter((result) => result.status === "fulfilled").length, 1);

  await assert.rejects(
    () => updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "RECEBIDO"),
    (error) => error?.statusCode === 409,
  );
  await assert.rejects(
    () => updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "SAIU_ENTREGA"),
    (error) => error?.statusCode === 409,
  );

  await updateStoreOrderStatus(state.seller.id, state.store.id, created.order.id, "PREPARANDO");
  const ready = await updateStoreOrderStatus(
    state.seller.id,
    state.store.id,
    created.order.id,
    "PRONTO_RETIRADA",
  );
  assert.equal(ready.order.status, "PRONTO_RETIRADA");
});

test("autonomous QR sale settles immediately and creates its Pix payout", async () => {
  const created = await createAutonomousSale(state.seller.id, {
    amountCents: 1000,
    description: "Autonomous hold test",
    title: "Autonomous hold test",
  });
  const paid = await payChargeWithWallet(state.buyer.id, created.charge.code);
  const transaction = await prisma.transacaoComercial.findUnique({
    include: { recebiveis: true, recompensas: true, repasse_pix: true },
    where: { pagamento_id: paid.charge.payment.id },
  });

  assert.equal(created.sale.paymentPath, null);
  assert.equal(transaction.status, "LIQUIDADA");
  assert.equal(transaction.vendedor_id, state.sellerProfile.id);
  assert.ok(transaction.recebiveis.every((receivable) => receivable.status === "DISPONIVEL"));
  assert.ok(transaction.recompensas.every((reward) => reward.status === "LIBERADA"));
  assert.equal(transaction.repasse_pix.status, "FALHOU");
});

test("autonomous sale refuses an active seller whose identity is no longer approved", async () => {
  await prisma.$transaction([
    prisma.kycUsuario.update({
      data: { status: "PENDENTE", validado_em: null },
      where: { usuario_id: state.seller.id },
    }),
    prisma.usuario.update({
      data: { nivel_kyc: "TIER_1" },
      where: { id: state.seller.id },
    }),
  ]);

  await assert.rejects(
    () => createAutonomousSale(state.seller.id, {
      amountCents: 1000,
      title: "Blocked autonomous sale",
    }),
    (error) => error?.statusCode === 428
      && error.message.includes("verificacao de identidade"),
  );

  await prisma.$transaction([
    prisma.kycUsuario.update({
      data: { status: "APROVADO", validado_em: new Date() },
      where: { usuario_id: state.seller.id },
    }),
    prisma.usuario.update({
      data: { nivel_kyc: "TIER_2" },
      where: { id: state.seller.id },
    }),
  ]);
});

test("commercial earnings stay pending for 24 hours and release only once", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Held settlement test", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });
  await movePickupOrderToReady(created.order.id);
  await completeCustomerOrder(state.buyer.id, created.order.id);
  const paymentId = created.order.payment.id;
  const transactionBefore = await prisma.transacaoComercial.findUnique({
    include: {
      lancamentos_plataforma: true,
      recebiveis: true,
      recompensas: true,
    },
    where: { pagamento_id: paymentId },
  });
  const pendingCredits = await prisma.lancamentoCarteira.findMany({
    where: {
      origem_id: transactionBefore.id,
      status: "PENDENTE",
      tipo_lancamento: "CREDITO",
    },
  });

  assert.equal(transactionBefore.status, "VALIDADA");
  assert.equal(transactionBefore.liquidada_em, null);
  assert.ok(transactionBefore.recompensas.every((reward) => reward.status === "PENDENTE"));
  assert.ok(transactionBefore.recebiveis.every((receivable) => receivable.status === "PENDENTE"));
  assert.ok(transactionBefore.lancamentos_plataforma.every((entry) => entry.status === "PENDENTE"));
  assert.ok(pendingCredits.length >= 2);

  const releaseAt = new Date(transactionBefore.validada_em.getTime() + (24 * 60 * 60 * 1000) + 1);
  const released = await prisma.$transaction((database) =>
    releaseCommercialSettlement(database, transactionBefore.id, { now: releaseAt }),
  );
  const duplicate = await prisma.$transaction((database) =>
    releaseCommercialSettlement(database, transactionBefore.id, { now: releaseAt }),
  );
  const transactionAfter = await prisma.transacaoComercial.findUnique({
    include: {
      lancamentos_plataforma: true,
      recebiveis: true,
      recompensas: true,
    },
    where: { id: transactionBefore.id },
  });

  assert.equal(released.released, true);
  assert.equal(duplicate.released, false);
  assert.equal(transactionAfter.status, "LIQUIDADA");
  assert.ok(transactionAfter.recompensas.every((reward) => reward.status === "LIBERADA"));
  assert.ok(transactionAfter.recebiveis.every((receivable) => receivable.status === "DISPONIVEL"));
  assert.ok(transactionAfter.lancamentos_plataforma.every((entry) => entry.status === "PROCESSADO"));
  await assert.rejects(
    refundAdminPayment(1, paymentId, { reason: "Fora da janela automatica." }),
    (error) => error.statusCode === 409,
  );
});

test("admin refund reverses the buyer return and every pending earning", async () => {
  const created = await createCheckoutOrder(state.buyer.id, {
    address: null,
    addressId: null,
    deliveryMode: "pickup",
    items: [{ notes: "Refund settlement test", productId: state.product.id, quantity: 1 }],
    payment: { balanceUsedCents: 1099, useBalance: true },
    storeId: state.store.id,
  });
  await movePickupOrderToReady(created.order.id);
  await completeCustomerOrder(state.buyer.id, created.order.id);
  const paymentId = created.order.payment.id;
  const transactionBefore = await prisma.transacaoComercial.findUnique({
    include: {
      lancamentos_plataforma: true,
      recebiveis: true,
      recompensas: true,
    },
    where: { pagamento_id: paymentId },
  });

  assert.equal(transactionBefore.status, "VALIDADA");
  assert.ok(transactionBefore.recompensas.length > 0);
  assert.ok(transactionBefore.recebiveis.length > 0);
  assert.ok(transactionBefore.recompensas.every((reward) => reward.status === "PENDENTE"));
  assert.ok(transactionBefore.recebiveis.every((receivable) => receivable.status === "PENDENTE"));

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
