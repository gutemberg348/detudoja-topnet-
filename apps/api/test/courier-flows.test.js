import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import {
  acceptCourierRequest,
  cancelCourierRequest,
  createCustomerCourierRequest,
  createCourierRequest,
  listCourierRequests,
} from "../src/modules/courier/courier-dispatch.service.js";
import {
  acceptServiceConversation,
  acceptServiceProposal,
  cancelServiceConversation,
  createServiceConversation,
  createServiceConversationLocation,
  createServiceConversationMessage,
  createServiceProposal,
  confirmServiceCompletion,
  createServiceReview,
  disputeServiceCompletion,
  getServiceConversation,
  markServiceDelivered,
  registerSellerService,
} from "../src/modules/service-chats/service-chats.service.js";
import { expireUnattendedServices } from "../src/modules/service-chats/service-timeout.service.js";
import { payChargeWithWallet } from "../src/modules/charges/charge.service.js";
import {
  creditUserWallet,
  ensureUserWallets,
} from "../src/modules/wallet/wallet.service.js";

const marker = "courier-flow-test";
const state = {};

const people = {
  customer: ["Courier Customer", "48178245601", "11920000001"],
  owner: ["Courier Store Owner", "74210368000", "11920000002"],
  teamCourier: ["Courier Team", "98765432100", "11920000003"],
  publicCourier: ["Courier Public", "52998224725", "11920000004"],
  secondCourier: ["Courier Second", "16899535009", "11920000005"],
  wrongCityCourier: ["Courier Wrong City", "11144477735", "11920000006"],
  provider: ["General Provider", "12345678909", "11920000007"],
  outsider: ["Courier Outsider", "39053344705", "11920000008"],
};

async function cleanup() {
  const users = await prisma.usuario.findMany({
    select: { id: true },
    where: { email: { endsWith: `@${marker}.local` } },
  });
  const userIds = users.map((user) => user.id);

  const sellers = userIds.length
    ? await prisma.vendedor.findMany({
        select: { id: true },
        where: { usuario_id: { in: userIds } },
      })
    : [];
  const sellerIds = sellers.map((seller) => seller.id);
  const couriers = sellerIds.length
    ? await prisma.motoboy.findMany({
        select: { id: true },
        where: { vendedor_id: { in: sellerIds } },
      })
    : [];
  const courierIds = couriers.map((courier) => courier.id);
  const serviceCharges = sellerIds.length
    ? await prisma.cobranca.findMany({
        select: { id: true, pagamento_id: true },
        where: { vendedor_id: { in: sellerIds } },
      })
    : [];
  const serviceChargeIds = serviceCharges.map((charge) => charge.id);
  const servicePaymentIds = serviceCharges
    .map((charge) => charge.pagamento_id)
    .filter(Boolean);
  const serviceTransactions = servicePaymentIds.length
    ? await prisma.transacaoComercial.findMany({
        select: { id: true },
        where: { pagamento_id: { in: servicePaymentIds } },
      })
    : [];
  const serviceTransactionIds = serviceTransactions.map((transaction) => transaction.id);
  const stores = userIds.length
    ? await prisma.loja.findMany({
        select: { id: true },
        where: { lojista: { usuario_id: { in: userIds } } },
      })
    : [];
  const storeIds = stores.map((store) => store.id);

  await prisma.$transaction(async (database) => {
    if (serviceTransactionIds.length) {
      await database.repassePix.deleteMany({ where: { transacao_comercial_id: { in: serviceTransactionIds } } });
      await database.eventoFinanceiro.deleteMany({ where: { transacao_comercial_id: { in: serviceTransactionIds } } });
      await database.lancamentoPlataforma.deleteMany({ where: { transacao_comercial_id: { in: serviceTransactionIds } } });
      await database.recompensa.deleteMany({ where: { transacao_comercial_id: { in: serviceTransactionIds } } });
      await database.recebivel.deleteMany({ where: { transacao_comercial_id: { in: serviceTransactionIds } } });
      await database.transacaoComercial.deleteMany({ where: { id: { in: serviceTransactionIds } } });
    }
    if (servicePaymentIds.length) {
      await database.eventoFinanceiro.deleteMany({ where: { pagamento_id: { in: servicePaymentIds } } });
      await database.eventoGatewayPagamento.deleteMany({ where: { pagamento_id: { in: servicePaymentIds } } });
      await database.pagamentoComposicao.deleteMany({ where: { pagamento_id: { in: servicePaymentIds } } });
      await database.pagamento.deleteMany({ where: { id: { in: servicePaymentIds } } });
    }
    if (serviceChargeIds.length) {
      await database.cobranca.deleteMany({ where: { id: { in: serviceChargeIds } } });
    }
    if (userIds.length || sellerIds.length || storeIds.length) {
      await database.solicitacaoMotoboy.deleteMany({
        where: {
          OR: [
            ...(userIds.length ? [{ solicitante_usuario_id: { in: userIds } }] : []),
            ...(courierIds.length ? [
              { motoboy_aceite_id: { in: courierIds } },
              { motoboy_direcionado_id: { in: courierIds } },
            ] : []),
            ...(storeIds.length ? [{ loja_id: { in: storeIds } }] : []),
          ],
        },
      });
      await database.conversaServico.deleteMany({
        where: {
          OR: [
            ...(userIds.length ? [{ cliente_usuario_id: { in: userIds } }] : []),
            ...(sellerIds.length ? [{ vendedor_id: { in: sellerIds } }] : []),
            ...(storeIds.length ? [{ loja_solicitante_id: { in: storeIds } }] : []),
          ],
        },
      });
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
      await database.enderecoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
      await database.loja.deleteMany({ where: { id: { in: storeIds } } });
    }
    if (userIds.length) {
      await database.lojista.deleteMany({ where: { usuario_id: { in: userIds } } });
      await database.enderecoUsuario.deleteMany({ where: { usuario_id: { in: userIds } } });
      await database.lancamentoCarteira.deleteMany({ where: { usuario_id: { in: userIds } } });
      await database.carteira.deleteMany({ where: { usuario_id: { in: userIds } } });
      await database.usuario.deleteMany({ where: { id: { in: userIds } } });
    }
    if (state.createdDeliveryTypeId) {
      await database.tipoServico.deleteMany({ where: { id: state.createdDeliveryTypeId } });
    }
    await database.tipoServico.deleteMany({
      where: { slug: { startsWith: "capinador-de-lote-90037-" } },
    });
    await database.tipoServico.deleteMany({ where: { slug: `${marker}-general` } });
    await database.segmentoVenda.deleteMany({
      where: { slug: { in: [`${marker}-delivery`, `${marker}-general`] } },
    });
    await database.categoriaLoja.deleteMany({
      where: { nome: { in: [`${marker}-delivery`, `${marker}-general`] } },
    });
  });
}

async function createUser(key, city = "Patos") {
  const [name, cpf, phone] = people[key];
  return prisma.usuario.create({
    data: {
      cpf,
      email: `${key}@${marker}.local`,
      enderecos: {
        create: {
          bairro: "Centro",
          cep: city === "Patos" ? "58700000" : "58800000",
          cidade: city,
          estado: "PB",
          numero: "100",
          principal: true,
          rua: "Rua dos Testes",
        },
      },
      nome: name,
      nivel_kyc: "TIER_2",
      senha_hash: "not-used-by-courier-tests",
      status: "ATIVO",
      telefone: phone,
      kyc: {
        create: {
          cpf,
          nome_completo: name,
          status: "APROVADO",
          tipo_pessoa: "FISICA",
          validado_em: new Date(),
        },
      },
    },
  });
}

async function createCourier(user, deliveryType, {
  acceptsPlatformCalls,
  city = "Patos",
  code,
}) {
  const seller = await prisma.vendedor.create({
    data: {
      cpf: user.cpf,
      nome_publico: user.nome,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: user.id,
    },
  });
  const service = await prisma.servicoVendedor.create({
    data: {
      categoria: deliveryType.nome,
      disponibilidade_atualizada_em: new Date(),
      disponivel_agora: true,
      nome: deliveryType.nome,
      status: "ATIVO",
      tipo_servico_id: deliveryType.id,
      vendedor_id: seller.id,
    },
  });
  const courier = await prisma.motoboy.create({
    data: {
      aceita_chamadas_plataforma: acceptsPlatformCalls,
      cidade_base: city,
      cnh: `100000000${code.padStart(2, "0")}`,
      estado_base: "PB",
      modelo_moto: "Moto Teste",
      nome_exibicao: user.nome,
      placa: `TST${code}A0`,
      status: "ATIVO",
      telefone_contato: user.telefone,
      vendedor_id: seller.id,
    },
  });
  return { courier, seller, service };
}

before(async () => {
  await prisma.$connect();
  await cleanup();

  const category = await prisma.categoriaLoja.create({
    data: { nome: `${marker}-delivery`, status: "ATIVA" },
  });
  let deliveryType = await prisma.tipoServico.findFirst({
    include: { segmento_venda: true },
    where: {
      excluido_em: null,
      slug: "motoboy",
      status: "ATIVO",
      tipo_operacao: "ENTREGA_LOCAL",
    },
  });
  if (!deliveryType?.segmento_venda || deliveryType.segmento_venda.status !== "ATIVO") {
    const deliverySegment = await prisma.segmentoVenda.create({
      data: {
        categoria_loja_id: category.id,
        nome: `${marker}-delivery`,
        slug: `${marker}-delivery`,
        status: "ATIVO",
      },
    });
    deliveryType = await prisma.tipoServico.create({
      include: { segmento_venda: true },
      data: {
        modo_atendimento: "NEGOCIACAO_CHAT",
        nome: "Motoboy Teste",
        segmento_venda_id: deliverySegment.id,
        slug: "motoboy",
        status: "ATIVO",
        tipo_operacao: "ENTREGA_LOCAL",
      },
    });
    state.createdDeliveryTypeId = deliveryType.id;
  }

  const generalCategory = await prisma.categoriaLoja.create({
    data: { nome: `${marker}-general`, status: "ATIVA" },
  });
  const generalSegment = await prisma.segmentoVenda.create({
    data: {
      categoria_loja_id: generalCategory.id,
      nome: `${marker}-general`,
      slug: `${marker}-general`,
      status: "ATIVO",
    },
  });
  const generalType = await prisma.tipoServico.create({
    data: {
      modo_atendimento: "NEGOCIACAO_CHAT",
      nome: "Servico Geral Courier Test",
      segmento_venda_id: generalSegment.id,
      slug: `${marker}-general`,
      status: "ATIVO",
      tipo_operacao: "GERAL",
    },
  });

  const [owner, customer, teamUser, publicUser, secondUser, wrongCityUser, providerUser, outsider] = await Promise.all([
    createUser("owner"),
    createUser("customer"),
    createUser("teamCourier"),
    createUser("publicCourier"),
    createUser("secondCourier"),
    createUser("wrongCityCourier", "Sousa"),
    createUser("provider"),
    createUser("outsider"),
  ]);
  const merchant = await prisma.lojista.create({
    data: {
      cpf: owner.cpf,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: owner.id,
    },
  });
  const store = await prisma.loja.create({
    data: {
      categoria_id: category.id,
      endereco: {
        create: {
          bairro: "Centro",
          cep: "58700000",
          cidade: "Patos",
          estado: "PB",
          numero: "10",
          rua: "Rua da Loja",
        },
      },
      lojista_id: merchant.id,
      nome: "Courier Test Store",
      slug: `${marker}-store`,
      status: "ATIVA",
    },
  });
  const team = await createCourier(teamUser, deliveryType, {
    acceptsPlatformCalls: false,
    code: "1",
  });
  const publicCourier = await createCourier(publicUser, deliveryType, {
    acceptsPlatformCalls: true,
    code: "2",
  });
  const secondCourier = await createCourier(secondUser, deliveryType, {
    acceptsPlatformCalls: true,
    code: "3",
  });
  const wrongCityCourier = await createCourier(wrongCityUser, deliveryType, {
    acceptsPlatformCalls: true,
    city: "Sousa",
    code: "4",
  });
  const teamMembership = await prisma.motoboyLoja.create({
    data: { loja_id: store.id, motoboy_id: team.courier.id },
  });
  const providerSeller = await prisma.vendedor.create({
    data: {
      cpf: providerUser.cpf,
      nome_publico: providerUser.nome,
      segmento_venda_id: generalSegment.id,
      status: "ATIVO",
      status_kyc: "APROVADO",
      tipo_pessoa: "FISICA",
      usuario_id: providerUser.id,
    },
  });
  const providerService = await prisma.servicoVendedor.create({
    data: {
      categoria: generalType.nome,
      disponibilidade_atualizada_em: new Date(),
      disponivel_agora: true,
      nome: generalType.nome,
      status: "ATIVO",
      tipo_servico_id: generalType.id,
      vendedor_id: providerSeller.id,
    },
  });

  Object.assign(state, {
    customer,
    deliveryType,
    outsider,
    owner,
    providerService,
    providerUser,
    publicCourier,
    secondCourier,
    store,
    team,
    teamMembership,
    teamUser,
    wrongCityUser,
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("general store call reaches public and linked couriers in the same city", async () => {
  const requestData = {
    description: "Levar um pacote pequeno",
    destination: "Rua Destino, 20, Centro, Patos - PB",
    origin: "Rua da Loja, 10, Centro, Patos - PB",
  };
  const [created, repeatedClick] = await Promise.all([
    createCourierRequest(state.owner.id, state.store.id, requestData),
    createCourierRequest(state.owner.id, state.store.id, requestData),
  ]);

  const [teamInbox, publicInbox, wrongCityInbox] = await Promise.all([
    listCourierRequests(state.teamUser.id),
    listCourierRequests(state.publicCourier.seller.usuario_id),
    listCourierRequests(state.wrongCityUser.id),
  ]);

  assert.equal(created.request.status, "PENDENTE");
  assert.equal(repeatedClick.request.id, created.request.id);
  assert.equal(await prisma.solicitacaoMotoboy.count({
    where: { loja_id: state.store.id, status: "PENDENTE" },
  }), 1);
  assert.ok(teamInbox.requests.some((request) => request.id === created.request.id));
  assert.ok(publicInbox.requests.some((request) => request.id === created.request.id));
  assert.ok(!wrongCityInbox.requests.some((request) => request.id === created.request.id));
  state.generalRequestId = created.request.id;
});

test("only one courier accepts a call and requester and winner enter the same chat", async () => {
  const attempts = await Promise.allSettled([
    acceptCourierRequest(state.teamUser.id, state.generalRequestId),
    acceptCourierRequest(state.publicCourier.seller.usuario_id, state.generalRequestId),
  ]);
  const accepted = attempts.find((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.find((attempt) => attempt.status === "rejected");

  assert.ok(accepted);
  assert.ok(rejected);
  assert.equal(rejected.reason.statusCode, 409);

  const persisted = await prisma.solicitacaoMotoboy.findUnique({
    include: { conversa_servico: true },
    where: { id: state.generalRequestId },
  });
  assert.equal(persisted.status, "ACEITA");
  assert.equal(persisted.conversa_servico.status, "ACORDADA");

  const [requesterView, winnerView] = await Promise.all([
    getServiceConversation(state.owner.id, persisted.conversa_servico_id),
    getServiceConversation(accepted.value.request.acceptedCourier.userId, persisted.conversa_servico_id),
  ]);
  assert.equal(requesterView.conversation.id, winnerView.conversation.id);
  await assert.rejects(
    getServiceConversation(state.outsider.id, persisted.conversa_servico_id),
    (error) => error.statusCode === 404,
  );

  const repeated = await createCourierRequest(state.owner.id, state.store.id, {
    description: "Tentativa duplicada",
    destination: "Outro destino em Patos - PB",
    origin: "Rua da Loja, 10, Centro, Patos - PB",
  });
  assert.equal(repeated.request.id, state.generalRequestId);

  await cancelServiceConversation(state.owner.id, persisted.conversa_servico_id);
});

test("accepting and canceling the same courier request leaves exactly one final state", async () => {
  const created = await createCustomerCourierRequest(state.customer.id, {
    description: "Disputa entre aceitar e cancelar",
    serviceTypeId: state.deliveryType.id,
  });
  const attempts = await Promise.allSettled([
    acceptCourierRequest(state.secondCourier.seller.usuario_id, created.request.id),
    cancelCourierRequest(state.customer.id, created.request.id),
  ]);
  const successful = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");

  assert.equal(successful.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.statusCode, 409);

  const persisted = await prisma.solicitacaoMotoboy.findUnique({
    include: { conversa_servico: true },
    where: { id: created.request.id },
  });
  assert.ok(["ACEITA", "CANCELADA"].includes(persisted.status));
  assert.equal(persisted.status === "ACEITA", Boolean(persisted.conversa_servico_id));

  if (persisted.conversa_servico_id) {
    await cancelServiceConversation(state.customer.id, persisted.conversa_servico_id);
  }
});

test("customer ride keeps route private until an address is shared in chat", async () => {
  const created = await createCustomerCourierRequest(state.customer.id, {
    description: "Combinar retirada e destino no chat",
    destination: "Endereco que nao deve ser usado",
    origin: "Casa do cliente que nao deve ser usada",
    serviceTypeId: state.deliveryType.id,
  });

  assert.equal(created.request.origin, "A combinar no chat");
  assert.equal(created.request.destination, "A combinar no chat");

  const accepted = await acceptCourierRequest(
    state.secondCourier.seller.usuario_id,
    created.request.id,
  );
  await createServiceConversationLocation(
    state.customer.id,
    accepted.conversation.id,
    {
      city: "Patos",
      complement: "Casa",
      district: "Centro",
      label: "RETIRADA",
      number: "42",
      reference: "Portao verde",
      state: "PB",
      street: "Rua Compartilhada",
      zipCode: "58700000",
    },
  );
  const courierView = await getServiceConversation(
    state.secondCourier.seller.usuario_id,
    accepted.conversation.id,
  );
  const sharedLocation = courierView.conversation.messages.find((message) => message.location);

  assert.equal(sharedLocation.location.street, "Rua Compartilhada");
  assert.equal(sharedLocation.location.number, "42");
  await cancelServiceConversation(state.customer.id, accepted.conversation.id);
});

test("worker cancela corrida aceita sem interacao ou proposta apos o prazo", async () => {
  const created = await createCustomerCourierRequest(state.customer.id, {
    description: "Corrida abandonada para teste de expiracao",
    serviceTypeId: state.deliveryType.id,
  });
  const accepted = await acceptCourierRequest(
    state.secondCourier.seller.usuario_id,
    created.request.id,
  );
  const past = new Date(Date.now() - (2 * 60 * 60 * 1_000));

  await prisma.conversaServico.update({
    data: { atualizado_em: past },
    where: { id: accepted.conversation.id },
  });

  const result = await expireUnattendedServices({ now: new Date() });
  const [conversation, request] = await Promise.all([
    prisma.conversaServico.findUniqueOrThrow({ where: { id: accepted.conversation.id } }),
    prisma.solicitacaoMotoboy.findUniqueOrThrow({ where: { id: created.request.id } }),
  ]);

  assert.ok(result.cancelledIdle >= 1);
  assert.equal(conversation.status, "CANCELADA");
  assert.equal(request.status, "CANCELADA");
  assert.ok(conversation.encerrado_em);
  assert.ok(request.cancelado_em);
});

test("direct store call is visible and acceptable only by the selected team courier", async () => {
  const created = await createCourierRequest(state.owner.id, state.store.id, {
    description: "Entrega da equipe",
    destination: "Rua Equipe, 50, Patos - PB",
    origin: "Rua da Loja, 10, Centro, Patos - PB",
    teamMemberId: state.teamMembership.id,
  });
  const [teamInbox, publicInbox] = await Promise.all([
    listCourierRequests(state.teamUser.id),
    listCourierRequests(state.secondCourier.seller.usuario_id),
  ]);

  assert.ok(teamInbox.requests.some((request) => request.id === created.request.id));
  assert.ok(!publicInbox.requests.some((request) => request.id === created.request.id));
  await assert.rejects(
    acceptCourierRequest(state.secondCourier.seller.usuario_id, created.request.id),
    (error) => error.statusCode === 403,
  );

  const accepted = await acceptCourierRequest(state.teamUser.id, created.request.id);
  assert.equal(accepted.request.acceptedCourier.userId, state.teamUser.id);
  await cancelServiceConversation(state.owner.id, accepted.conversation.id);
});

test("regular service waits for provider acceptance before releasing chat", async () => {
  const created = await createServiceConversation(state.customer.id, {
    description: "Preciso combinar um servico",
    sellerServiceId: state.providerService.id,
  });
  assert.equal(created.conversation.status, "ABERTA");

  await assert.rejects(
    createServiceConversationMessage(state.customer.id, created.conversation.id, {
      message: "Mensagem antes do aceite",
    }),
    (error) => error.statusCode === 409,
  );
  await assert.rejects(
    acceptServiceConversation(state.customer.id, created.conversation.id),
    (error) => error.statusCode === 403,
  );

  const attempts = await Promise.allSettled([
    acceptServiceConversation(state.providerUser.id, created.conversation.id),
    acceptServiceConversation(state.providerUser.id, created.conversation.id),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);

  await createServiceConversationMessage(state.customer.id, created.conversation.id, {
    message: "Mensagem depois do aceite",
  });
  await createServiceConversationMessage(state.providerUser.id, created.conversation.id, {
    message: "Resposta do prestador",
  });
  const customerView = await getServiceConversation(state.customer.id, created.conversation.id);
  assert.equal(customerView.conversation.status, "ACORDADA");
  assert.equal(customerView.conversation.messages.at(-1).text, "Resposta do prestador");
  assert.ok(customerView.conversation.messages.at(-1).readAt);
  const providerView = await getServiceConversation(state.providerUser.id, created.conversation.id);
  assert.ok(providerView.conversation.messages.find(
    (message) => message.text === "Mensagem depois do aceite",
  )?.readAt);
  await cancelServiceConversation(state.customer.id, created.conversation.id);
});

test("simultaneous service clicks reuse one active conversation", async () => {
  const attempts = await Promise.all([
    createServiceConversation(state.customer.id, {
      description: "Solicitacao simultanea de teste.",
      sellerServiceId: state.providerService.id,
    }),
    createServiceConversation(state.customer.id, {
      description: "Solicitacao simultanea de teste.",
      sellerServiceId: state.providerService.id,
    }),
  ]);
  assert.equal(attempts[0].conversation.id, attempts[1].conversation.id);
  const active = await prisma.conversaServico.count({
    where: {
      cliente_usuario_id: state.customer.id,
      servico_vendedor_id: state.providerService.id,
      status: { in: ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"] },
    },
  });
  assert.equal(active, 1);
  await cancelServiceConversation(state.customer.id, attempts[0].conversation.id);
});

test("service registration reuses an equivalent category instead of creating a duplicate", async () => {
  const registered = await registerSellerService(state.providerUser.id, {
    available: true,
    description: "Limpeza de terrenos e quintais.",
    name: "Capinador de lote 90037",
  });
  const equivalent = await registerSellerService(state.providerUser.id, {
    available: false,
    name: "Limpador de mato 90037",
  });

  assert.equal(equivalent.createdType, false);
  assert.equal(equivalent.matchedBy, "family");
  assert.equal(equivalent.service.serviceTypeId, registered.service.serviceTypeId);

  const services = await prisma.servicoVendedor.count({
    where: {
      tipo_servico_id: registered.service.serviceTypeId,
      vendedor_id: state.providerService.vendedor_id,
    },
  });

  assert.equal(services, 1);
});

test("motoboy TIER_1 nao consegue aceitar uma corrida", async () => {
  const created = await createCustomerCourierRequest(state.customer.id, {
    description: "Teste de bloqueio por KYC",
    serviceTypeId: state.deliveryType.id,
  });

  await prisma.usuario.update({
    data: { nivel_kyc: "TIER_1" },
    where: { id: state.publicCourier.seller.usuario_id },
  });
  try {
    await assert.rejects(
      acceptCourierRequest(state.publicCourier.seller.usuario_id, created.request.id),
      (error) => error.statusCode === 428,
    );
  } finally {
    await prisma.usuario.update({
      data: { nivel_kyc: "TIER_2" },
      where: { id: state.publicCourier.seller.usuario_id },
    });
    await prisma.solicitacaoMotoboy.update({
      data: { cancelado_em: new Date(), status: "CANCELADA" },
      where: { id: created.request.id },
    });
  }
});

test("prestador reprovado apos abrir o atendimento nao consegue operar a conversa", async () => {
  await ensureUserWallets(state.customer.id);
  await creditUserWallet({
    database: prisma,
    description: "Saldo para teste de KYC durante atendimento.",
    origin: "CAMPANHA",
    originId: 90038,
    userId: state.customer.id,
    valueCents: 2000,
    walletCode: "saldo_pix",
  });

  const created = await createServiceConversation(state.customer.id, {
    description: "Servico com revalidacao de KYC.",
    sellerServiceId: state.providerService.id,
  });
  await acceptServiceConversation(state.providerUser.id, created.conversation.id);
  const proposal = await createServiceProposal(state.providerUser.id, created.conversation.id, {
    amountCents: 1000,
    paymentMode: "ONLINE",
  });
  const accepted = await acceptServiceProposal(state.customer.id, created.conversation.id, proposal.proposal.id);
  await payChargeWithWallet(state.customer.id, accepted.charge.code);

  await prisma.vendedor.update({
    data: { status_kyc: "REPROVADO" },
    where: { id: state.providerService.vendedor_id },
  });
  try {
    await assert.rejects(
      markServiceDelivered(state.providerUser.id, created.conversation.id),
      (error) => error.statusCode === 403,
    );
    await assert.rejects(
      createServiceConversationMessage(state.providerUser.id, created.conversation.id, { message: "Nao deve enviar" }),
      (error) => error.statusCode === 403,
    );
  } finally {
    await prisma.vendedor.update({
      data: { status_kyc: "APROVADO" },
      where: { id: state.providerService.vendedor_id },
    });
  }

  await markServiceDelivered(state.providerUser.id, created.conversation.id);
  const disputed = await disputeServiceCompletion(state.customer.id, created.conversation.id);
  assert.equal(disputed.conversation.status, "EM_DISPUTA");
});

test("worker estorna servico pago sem inicio e envia confirmacao vencida para disputa", async () => {
  await Promise.all([state.customer.id, state.outsider.id].map(async (userId, index) => {
    await ensureUserWallets(userId);
    await creditUserWallet({
      database: prisma,
      description: "Saldo para teste de prazo de servico.",
      origin: "CAMPANHA",
      originId: 90039 + index,
      userId,
      valueCents: 2000,
      walletCode: "saldo_pix",
    });
  }));

  const createPaidService = async (userId, description) => {
    const created = await createServiceConversation(userId, {
      description,
      sellerServiceId: state.providerService.id,
    });
    await acceptServiceConversation(state.providerUser.id, created.conversation.id);
    const proposal = await createServiceProposal(state.providerUser.id, created.conversation.id, {
      amountCents: 1000,
      paymentMode: "ONLINE",
    });
    const accepted = await acceptServiceProposal(userId, created.conversation.id, proposal.proposal.id);
    await payChargeWithWallet(userId, accepted.charge.code);
    return { conversationId: created.conversation.id, proposalId: proposal.proposal.id };
  };

  const unattended = await createPaidService(state.customer.id, "Servico sem inicio no prazo.");
  const unconfirmed = await createPaidService(state.outsider.id, "Servico aguardando confirmacao no prazo.");
  await markServiceDelivered(state.providerUser.id, unconfirmed.conversationId);

  const past = new Date(Date.now() - (3 * 24 * 60 * 60 * 1_000));
  await prisma.$transaction([
    prisma.pagamento.updateMany({
      data: { pago_em: past },
      where: { cobranca: { proposta_servico_id: unattended.proposalId } },
    }),
    prisma.conversaServico.update({
      data: { atualizado_em: past },
      where: { id: unconfirmed.conversationId },
    }),
  ]);

  const result = await expireUnattendedServices({ now: new Date() });
  const [expiredConversation, expiredPayment, disputedConversation] = await Promise.all([
    prisma.conversaServico.findUniqueOrThrow({ where: { id: unattended.conversationId } }),
    prisma.pagamento.findFirstOrThrow({ where: { cobranca: { proposta_servico_id: unattended.proposalId } } }),
    prisma.conversaServico.findUniqueOrThrow({ where: { id: unconfirmed.conversationId } }),
  ]);

  assert.equal(result.refunded, 1);
  assert.equal(result.disputed, 1);
  assert.equal(expiredConversation.status, "CANCELADA");
  assert.equal(expiredPayment.status, "ESTORNADO");
  assert.equal(disputedConversation.status, "EM_DISPUTA");
});

test("pagamento de servico fica em custodia ate a confirmacao do cliente", async () => {
  await ensureUserWallets(state.customer.id);
  await creditUserWallet({
    database: prisma,
    description: "Saldo para teste de custodia de servico.",
    origin: "CAMPANHA",
    originId: 90037,
    userId: state.customer.id,
    valueCents: 5000,
    walletCode: "saldo_pix",
  });

  const created = await createServiceConversation(state.customer.id, {
    description: "Servico que precisa ser confirmado.",
    sellerServiceId: state.providerService.id,
  });
  await acceptServiceConversation(state.providerUser.id, created.conversation.id);
  const proposed = await createServiceProposal(state.providerUser.id, created.conversation.id, {
    amountCents: 1000,
    description: "Limpeza combinada.",
    paymentMode: "ONLINE",
  });
  const accepted = await acceptServiceProposal(
    state.customer.id,
    created.conversation.id,
    proposed.proposal.id,
  );
  await payChargeWithWallet(state.customer.id, accepted.charge.code);

  let transaction = await prisma.transacaoComercial.findFirst({
    where: { pagamento: { cobranca: { proposta_servico_id: proposed.proposal.id } } },
  });
  assert.equal(transaction, null);

  await markServiceDelivered(state.providerUser.id, created.conversation.id);
  await confirmServiceCompletion(state.customer.id, created.conversation.id);

  transaction = await prisma.transacaoComercial.findFirst({
    include: { recebiveis: true, recompensas: true },
    where: { pagamento: { cobranca: { proposta_servico_id: proposed.proposal.id } } },
  });
  assert.equal(transaction.status, "VALIDADA");
  assert.ok(transaction.validada_em);
  assert.equal(Number(transaction.base_comissao_centavos), 1000);
  assert.equal(Number(transaction.valor_entrega_lojista_centavos), 0);
  assert.equal(Number(transaction.taxa_plataforma_centavos), 100);
  assert.equal(Number(transaction.valor_liquido_lojista_centavos), 900);
  assert.ok(transaction.recebiveis.every((item) => item.status === "PENDENTE"));
  assert.ok(transaction.recompensas.every((item) => item.status === "PENDENTE"));

  const reviewed = await createServiceReview(state.customer.id, created.conversation.id, {
    comment: "Atendimento pontual e bem explicado.",
    rating: 4,
  });
  assert.equal(reviewed.conversation.review.rating, 4);
  assert.equal(reviewed.conversation.canReview, false);
  await assert.rejects(
    createServiceReview(state.customer.id, created.conversation.id, { rating: 5 }),
    (error) => error.statusCode === 409,
  );
  const seller = await prisma.vendedor.findUniqueOrThrow({ where: { id: state.providerService.vendedor_id } });
  assert.equal(Number(seller.avaliacao_media), 4);
});
