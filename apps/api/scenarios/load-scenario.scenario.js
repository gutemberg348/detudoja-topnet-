import assert from "node:assert/strict";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { after, before, test } from "node:test";
import argon2 from "argon2";
import { io as createSocketClient } from "socket.io-client";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { login, authAudiences } from "../src/modules/auth/auth.service.js";
import {
  createStoreQrCharge,
  payChargeWithWallet,
} from "../src/modules/charges/charge.service.js";
import {
  acceptCourierRequest,
  createCustomerCourierRequest,
} from "../src/modules/courier/courier-dispatch.service.js";
import {
  cancelServiceConversation,
  createServiceConversationMessage,
} from "../src/modules/service-chats/service-chats.service.js";
import {
  creditUserWallet,
  ensureUserWallets,
} from "../src/modules/wallet/wallet.service.js";
import {
  closeRealtimeServer,
  emitWalletUpdated,
  initRealtimeServer,
  realtimeEvents,
} from "../src/realtime/socket.server.js";

const marker = "load-e2e-20260827";
const password = "LoadScenario@2026";
const state = { timings: {} };

function cpf(prefix, index) {
  return `${prefix}${String(index).padStart(4, "0")}`;
}

function customerPayload(index, passwordHash) {
  const suffix = String(index).padStart(2, "0");
  const document = cpf("6188801", index);

  return {
    cpf: document,
    email: `cliente-${suffix}@${marker}.local`,
    enderecos: {
      create: {
        bairro: "Centro",
        cep: "58700000",
        cidade: "Patos",
        estado: "PB",
        nome_endereco: "Endereco principal",
        numero: String(100 + index),
        principal: true,
        rua: "Rua de Carga",
      },
    },
    kyc: {
      create: {
        cpf: document,
        nome_completo: `Cliente E2E ${suffix}`,
        status: "APROVADO",
        tipo_pessoa: "FISICA",
        validado_em: new Date(),
      },
    },
    nome: `Cliente E2E ${suffix}`,
    senha_hash: passwordHash,
    status: "ATIVO",
    telefone: `839910${String(index).padStart(5, "0")}`,
  };
}

async function cleanup() {
  const users = await prisma.usuario.findMany({
    select: { id: true },
    where: { email: { endsWith: `@${marker}.local` } },
  });
  const userIds = users.map((user) => user.id);

  if (!userIds.length) return;

  const [sellers, stores] = await Promise.all([
    prisma.vendedor.findMany({ select: { id: true }, where: { usuario_id: { in: userIds } } }),
    prisma.loja.findMany({ select: { id: true }, where: { lojista: { usuario_id: { in: userIds } } } }),
  ]);
  const sellerIds = sellers.map((seller) => seller.id);
  const storeIds = stores.map((store) => store.id);
  const couriers = sellerIds.length
    ? await prisma.motoboy.findMany({ select: { id: true }, where: { vendedor_id: { in: sellerIds } } })
    : [];
  const courierIds = couriers.map((courier) => courier.id);
  const conversations = await prisma.conversaServico.findMany({
    select: { id: true },
    where: {
      OR: [
        { cliente_usuario_id: { in: userIds } },
        ...(sellerIds.length ? [{ vendedor_id: { in: sellerIds } }] : []),
        ...(storeIds.length ? [{ loja_solicitante_id: { in: storeIds } }] : []),
      ],
    },
  });
  const conversationIds = conversations.map((conversation) => conversation.id);
  const charges = await prisma.cobranca.findMany({
    select: { id: true, pagamento_id: true },
    where: {
      OR: [
        { criador_usuario_id: { in: userIds } },
        ...(storeIds.length ? [{ loja_id: { in: storeIds } }] : []),
      ],
    },
  });
  const paymentIds = charges.map((charge) => charge.pagamento_id).filter(Boolean);
  const transactions = paymentIds.length
    ? await prisma.transacaoComercial.findMany({ select: { id: true }, where: { pagamento_id: { in: paymentIds } } })
    : [];
  const transactionIds = transactions.map((transaction) => transaction.id);

  await prisma.$transaction(async (database) => {
    await database.solicitacaoMotoboy.deleteMany({
      where: {
        OR: [
          { solicitante_usuario_id: { in: userIds } },
          ...(courierIds.length ? [
            { motoboy_aceite_id: { in: courierIds } },
            { motoboy_direcionado_id: { in: courierIds } },
          ] : []),
          ...(storeIds.length ? [{ loja_id: { in: storeIds } }] : []),
        ],
      },
    });
    if (conversationIds.length) {
      await database.conversaServicoMensagem.deleteMany({ where: { conversa_servico_id: { in: conversationIds } } });
      await database.propostaServico.deleteMany({ where: { conversa_servico_id: { in: conversationIds } } });
      await database.conversaServico.deleteMany({ where: { id: { in: conversationIds } } });
    }
    if (transactionIds.length) {
      await database.repassePix.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.eventoFinanceiro.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.documentoFiscal.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.lancamentoPlataforma.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.recompensa.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.recebivel.deleteMany({ where: { transacao_comercial_id: { in: transactionIds } } });
      await database.transacaoComercial.deleteMany({ where: { id: { in: transactionIds } } });
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
    if (courierIds.length) {
      await database.motoboyLoja.deleteMany({ where: { motoboy_id: { in: courierIds } } });
      await database.motoboy.deleteMany({ where: { id: { in: courierIds } } });
    }
    if (sellerIds.length) {
      await database.servicoVendedor.deleteMany({ where: { vendedor_id: { in: sellerIds } } });
      await database.vendedor.deleteMany({ where: { id: { in: sellerIds } } });
    }
    if (storeIds.length) {
      await database.produtoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
      await database.enderecoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
      await database.loja.deleteMany({ where: { id: { in: storeIds } } });
    }
    await database.lancamentoCarteira.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.carteira.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.contaBancaria.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.lojista.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.sessaoAutenticacao.deleteMany({ where: { usuario_id: { in: userIds } } });
    await database.usuario.deleteMany({ where: { id: { in: userIds } } });
    await database.tipoServico.deleteMany({ where: { slug: `${marker}-motoboy` } });
    await database.segmentoVenda.deleteMany({ where: { slug: `${marker}-segment` } });
    await database.categoriaLoja.deleteMany({ where: { nome: `${marker}-category` } });
  });
}

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout aguardando ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

before(async () => {
  await prisma.$connect();
  await cleanup();
  const passwordHash = await argon2.hash(password, { memoryCost: 19456, parallelism: 1, timeCost: 2, type: argon2.argon2id });
  const category = await prisma.categoriaLoja.create({ data: { nome: `${marker}-category`, status: "ATIVA" } });
  const segment = await prisma.segmentoVenda.create({
    data: {
      atende_por_chat: true,
      categoria_loja_id: category.id,
      nome: `${marker}-segment`,
      slug: `${marker}-segment`,
      status: "ATIVO",
      taxa_plataforma_percentual: 10,
    },
  });
  const deliveryType = await prisma.tipoServico.create({
    data: {
      modo_atendimento: "NEGOCIACAO_CHAT",
      nome: `${marker}-motoboy`,
      segmento_venda_id: segment.id,
      slug: `${marker}-motoboy`,
      status: "ATIVO",
      tipo_operacao: "ENTREGA_LOCAL",
    },
  });
  const ownerCpf = "61888000001";
  const owner = await prisma.usuario.create({
    data: {
      cpf: ownerCpf,
      email: `lojista@${marker}.local`,
      enderecos: { create: { bairro: "Centro", cep: "58700000", cidade: "Patos", estado: "PB", numero: "1", principal: true, rua: "Rua de Carga" } },
      kyc: { create: { cpf: ownerCpf, nome_completo: "Lojista E2E", status: "APROVADO", tipo_pessoa: "FISICA", validado_em: new Date() } },
      nome: "Lojista E2E",
      senha_hash: passwordHash,
      status: "ATIVO",
      telefone: "83990000001",
    },
  });
  const merchant = await prisma.lojista.create({ data: { cpf: ownerCpf, status: "ATIVO", status_kyc: "APROVADO", tipo_pessoa: "FISICA", usuario_id: owner.id } });
  await prisma.contaBancaria.create({ data: { chave_pix: ownerCpf, documento_titular: ownerCpf, nome_titular: owner.nome, principal: true, status: "ATIVA", tipo_chave: "CPF", usuario_id: owner.id } });
  const store = await prisma.loja.create({
    data: {
      aceita_pagamento_online: true,
      aceita_qrcode: true,
      aberta_para_pedidos: true,
      categoria_id: category.id,
      endereco: { create: { bairro: "Centro", cep: "58700000", cidade: "Patos", estado: "PB", numero: "10", rua: "Rua de Carga" } },
      lojista_id: merchant.id,
      nome: "Loja E2E de Carga",
      segmento_venda_id: segment.id,
      slug: `${marker}-store`,
      status: "ATIVA",
      visivel_no_app: true,
    },
  });
  const customers = await Promise.all(Array.from({ length: 39 }, (_, index) => prisma.usuario.create({ data: customerPayload(index + 1, passwordHash) })));
  const couriers = [];
  for (let index = 1; index <= 10; index += 1) {
    const document = cpf("6188802", index);
    const user = await prisma.usuario.create({
      data: {
        cpf: document,
        email: `motoboy-${String(index).padStart(2, "0")}@${marker}.local`,
        enderecos: { create: { bairro: "Centro", cep: "58700000", cidade: "Patos", estado: "PB", numero: String(200 + index), principal: true, rua: "Rua de Carga" } },
        kyc: { create: { cpf: document, nome_completo: `Motoboy E2E ${index}`, status: "APROVADO", tipo_pessoa: "FISICA", validado_em: new Date() } },
        nome: `Motoboy E2E ${index}`,
        senha_hash: passwordHash,
        status: "ATIVO",
        telefone: `839920${String(index).padStart(5, "0")}`,
      },
    });
    const seller = await prisma.vendedor.create({ data: { cpf: document, nome_publico: user.nome, segmento_venda_id: segment.id, status: "ATIVO", status_kyc: "APROVADO", tipo_pessoa: "FISICA", usuario_id: user.id } });
    const courier = await prisma.motoboy.create({ data: { aceita_chamadas_plataforma: true, cidade_base: "Patos", cnh: `8800000${String(index).padStart(3, "0")}`, estado_base: "PB", modelo_moto: "Moto E2E", nome_exibicao: user.nome, placa: `E2E${String(index).padStart(3, "0")}`, status: "ATIVO", telefone_contato: user.telefone, vendedor_id: seller.id } });
    await prisma.servicoVendedor.create({ data: { categoria: deliveryType.nome, disponivel_agora: true, nome: deliveryType.nome, status: "ATIVO", tipo_servico_id: deliveryType.id, vendedor_id: seller.id } });
    couriers.push({ courier, seller, user });
  }
  await Promise.all(
    [owner.id, ...customers.map((user) => user.id), ...couriers.map(({ user }) => user.id)]
      .map((userId) => ensureUserWallets(userId)),
  );
  Object.assign(state, { customers, couriers, deliveryType, owner, store });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("massa funcional: 50 contas, 10 chamadas, concorrencia de aceite e conversa", async () => {
  const startedAt = performance.now();
  assert.equal(state.customers.length + state.couriers.length + 1, 50);
  const firstRequest = await createCustomerCourierRequest(state.customers[0].id, {
    description: "Corrida concorrente de carga",
    destination: "Rua Destino, 10, Patos - PB",
    origin: "Rua Origem, 1, Patos - PB",
    serviceTypeId: state.deliveryType.id,
  });
  const race = await Promise.allSettled([
    acceptCourierRequest(state.couriers[0].user.id, firstRequest.request.id),
    acceptCourierRequest(state.couriers[1].user.id, firstRequest.request.id),
  ]);
  const winner = race.find((attempt) => attempt.status === "fulfilled");
  const loser = race.find((attempt) => attempt.status === "rejected");
  assert.ok(winner);
  assert.equal(loser.reason.statusCode, 409);

  const accepted = [{ customer: state.customers[0], conversation: winner.value.conversation }];
  const winnerCourierUserId = winner.value.request.acceptedCourier.userId;
  const freeCouriers = state.couriers.filter(({ user }) => user.id !== winnerCourierUserId);

  for (let index = 1; index <= 9; index += 1) {
    const request = await createCustomerCourierRequest(state.customers[index].id, {
      description: `Corrida de carga ${index + 1}`,
      destination: `Rua Destino, ${index + 10}, Patos - PB`,
      origin: `Rua Origem, ${index + 1}, Patos - PB`,
      serviceTypeId: state.deliveryType.id,
    });
    const acceptedRequest = await acceptCourierRequest(freeCouriers[index - 1].user.id, request.request.id);
    accepted.push({ customer: state.customers[index], conversation: acceptedRequest.conversation });
  }

  await Promise.all(accepted.flatMap(({ customer, conversation }, index) => [
    createServiceConversationMessage(customer.id, conversation.id, { message: `Cliente confirma corrida ${index + 1}` }),
    createServiceConversationMessage(conversation.seller.userId, conversation.id, { message: `Motoboy confirma corrida ${index + 1}` }),
  ]));
  await Promise.all(accepted.map(({ customer, conversation }) => cancelServiceConversation(customer.id, conversation.id)));

  const [requestCount, conversationCount, messageCount] = await Promise.all([
    prisma.solicitacaoMotoboy.count({ where: { solicitante_usuario_id: { in: state.customers.slice(0, 10).map((user) => user.id) }, status: "CANCELADA" } }),
    prisma.conversaServico.count({ where: { cliente_usuario_id: { in: state.customers.slice(0, 10).map((user) => user.id) }, status: "CANCELADA" } }),
    prisma.conversaServicoMensagem.count({
      where: {
        conversa: {
          cliente_usuario_id: { in: state.customers.slice(0, 10).map((user) => user.id) },
        },
      },
    }),
  ]);
  assert.equal(requestCount, 10);
  assert.equal(conversationCount, 10);
  assert.ok(messageCount >= 30);
  state.timings.couriersMs = Math.round(performance.now() - startedAt);
});

test("massa financeira: 12 QRs presenciais pagos sem gateway externo", async () => {
  const startedAt = performance.now();
  const payers = state.customers.slice(10, 22);
  await Promise.all(payers.map((user, index) => creditUserWallet({
    description: "Credito isolado para teste de carga.",
    origin: "AJUSTE_ADMIN",
    originId: 900000 + index,
    userId: user.id,
    valueCents: 3000,
    walletCode: "saldo_pix",
  })));
  const charges = await Promise.all(payers.map((_, index) => createStoreQrCharge(state.owner.id, state.store.id, {
    amountCents: 1000,
    description: `QR de carga ${index + 1}`,
    title: `Venda de carga ${index + 1}`,
  })));
  const paid = await Promise.all(charges.map((charge, index) => payChargeWithWallet(payers[index].id, charge.charge.code)));
  assert.equal(paid.length, 12);
  const persisted = await prisma.cobranca.findMany({
    where: { id: { in: charges.map((charge) => charge.charge.id) } },
  });
  assert.equal(persisted.filter((charge) => charge.status === "PAGA").length, 12);
  state.timings.paymentsMs = Math.round(performance.now() - startedAt);
});

test("realtime: entrega evento por WebSocket, sem polling", async () => {
  const session = await login({ audience: authAudiences.app, login: state.owner.email, password });
  const server = createServer(app);
  initRealtimeServer(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const socket = createSocketClient(`http://127.0.0.1:${port}`, {
    auth: { audience: authAudiences.app, token: session.accessToken },
    forceNew: true,
    transports: ["websocket"],
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    assert.equal(socket.io.engine.transport.name, "websocket");
    const event = waitForEvent(socket, realtimeEvents.walletUpdated);
    emitWalletUpdated({ transactionId: 999999, userIds: [state.owner.id] });
    const payload = await event;
    assert.equal(payload.userId, state.owner.id);
  } finally {
    socket.disconnect();
    await closeRealtimeServer();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`[load-scenario] 50 contas | 10 chamadas | 12 QRs pagos | chamadas: ${state.timings.couriersMs}ms | pagamentos: ${state.timings.paymentsMs}ms | realtime: WebSocket`);
});
