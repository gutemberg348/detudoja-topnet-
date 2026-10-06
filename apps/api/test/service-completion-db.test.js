import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../src/config/prisma.js";
import { markServiceDelivered, confirmServiceCompletion, disputeServiceCompletion, getServiceConversation } from "../src/modules/service-chats/service-chats.service.js";
import { completeLegacyDeliveredService } from "../src/modules/service-chats/legacy-service-completion.js";
import { releaseCommercialSettlement } from "../src/modules/earnings/earnings-release.service.js";
import { serviceTimeoutRepository } from "../src/modules/service-chats/service-timeout.repository.js";
import { expireUnattendedServices } from "../src/modules/service-chats/service-timeout.service.js";
import { ensureUserWallets, getWalletOverview } from "../src/modules/wallet/wallet.service.js";

test("service completion creates pending earnings and releases without a customer click", {
  skip: process.env.SERVICE_COMPLETION_DB_TESTS !== "true",
}, async (t) => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/service_completion_validation",
    "Use only the isolated service_completion_validation database");
  const marker = randomUUID();
  try {
    const people = await Promise.all(["seller", "customer", "outsider"].map((name) => prisma.usuario.create({ data: {
      nome: name, email: `${name}-${marker}@test.invalid`, senha_hash: "unused", status: "ATIVO", nivel_kyc: "TIER_2",
      kyc: { create: { tipo_pessoa: "FISICA", status: "APROVADO" } },
    } })));
    const [sellerUser, customer, outsider] = people;
    const segment = await prisma.segmentoVenda.create({ data: { nome: "Completion test", slug: marker } });
    const seller = await prisma.vendedor.create({ data: {
      usuario_id: sellerUser.id, segmento_venda_id: segment.id, nome_publico: "Provider QA", status: "ATIVO", status_kyc: "APROVADO",
    } });
    await Promise.all(people.map((person) => ensureUserWallets(person.id)));
    async function fixture({ status = "ACORDADA", paid = true, mode = "ONLINE" } = {}) {
      const conversation = await prisma.conversaServico.create({ data: {
        cliente_usuario_id: customer.id, vendedor_id: seller.id, segmento_venda_id: segment.id, status,
      } });
      const proposal = await prisma.propostaServico.create({ data: {
        conversa_servico_id: conversation.id, vendedor_id: seller.id, valor_centavos: 1000n,
        forma_pagamento: mode, status: paid ? "PAGA" : "ACEITA", pago_em: paid ? new Date() : null,
      } });
      const payment = paid ? await prisma.pagamento.create({ data: {
        usuario_pagador_id: customer.id, vendedor_id: seller.id, valor_total_centavos: 1000n,
        valor_pago_saldo_centavos: 1000n, metodo_principal: "SALDO_PIX", status: "PAGO", pago_em: new Date(),
      } }) : null;
      const charge = await prisma.cobranca.create({ data: {
        codigo_publico: `DTJ-${randomUUID()}`, criador_usuario_id: sellerUser.id, vendedor_id: seller.id,
        proposta_servico_id: proposal.id, pagamento_id: payment?.id, origem: "PRESENCIAL", titulo: "Test service",
        valor_centavos: 1000n, status: paid ? "PAGA" : "ATIVA", paga_em: paid ? new Date() : null,
      } });
      return { conversation, proposal, payment, charge };
    }
    const transactionFor = (fixture) => prisma.transacaoComercial.findUnique({ where: { pagamento_id: fixture.payment.id } });
    const wallet = () => prisma.carteira.findFirst({ where: { usuario_id: sellerUser.id, tipo_carteira: { codigo: "vendas" } } });
    const release = (id, now) => prisma.$transaction((db) => releaseCommercialSettlement(db, id, { now }));

    await t.test("paid funds stay reserved until provider delivers; concurrent delivery settles once", async () => {
      const data = await fixture();
      assert.equal(await transactionFor(data), null);
      const before = await getServiceConversation(sellerUser.id, data.conversation.id);
      assert.equal(before.conversation.proposals[0].funds.state, "AWAITING_SERVICE");
      await assert.rejects(markServiceDelivered(customer.id, data.conversation.id), (error) => error.statusCode === 403);
      await assert.rejects(markServiceDelivered(outsider.id, data.conversation.id), (error) => error.statusCode === 404);
      const results = await Promise.allSettled([
        markServiceDelivered(sellerUser.id, data.conversation.id), markServiceDelivered(sellerUser.id, data.conversation.id),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const response = results.find((result) => result.status === "fulfilled").value.conversation;
      assert.equal(response.status, "ENCERRADA");
      assert.equal(response.proposals[0].funds.netCents, 900);
      assert.equal(response.proposals[0].funds.feeCents, 100);
      assert.equal(response.proposals[0].funds.state, "PENDING_RELEASE");
      assert.equal(response.proposals[0].funds.destination, "SALES_WALLET");
      const transaction = await transactionFor(data);
      assert.equal(transaction.status, "VALIDADA");
      const overview = await getWalletOverview(sellerUser.id);
      const movement = overview.movements.find((item) => item.originId === transaction.id && item.origem === "VENDA");
      assert.match(movement.descricao, /Servico:/);
      assert.equal(movement.availableAt, response.proposals[0].funds.availableAt);
      assert.equal((await wallet()).saldo_pendente_centavos, 900n);
      assert.equal((await wallet()).saldo_disponivel_centavos, 0n);
      const client = await getServiceConversation(customer.id, data.conversation.id);
      assert.equal(client.conversation.canDispute, true);
      assert.equal(client.conversation.proposals[0].funds.netCents, undefined);
      await confirmServiceCompletion(customer.id, data.conversation.id);
      assert.equal((await transactionFor(data)).validada_em.getTime(), transaction.validada_em.getTime());
      const deadline = new Date(response.proposals[0].funds.availableAt);
      assert.equal((await release(transaction.id, new Date(deadline.getTime() - 1))).released, false);
      assert.equal((await release(transaction.id, deadline)).released, true);
      assert.equal((await release(transaction.id, deadline)).released, false);
      assert.equal((await wallet()).saldo_pendente_centavos, 0n);
      assert.equal((await wallet()).saldo_disponivel_centavos, 900n);
      const released = await getServiceConversation(sellerUser.id, data.conversation.id);
      assert.equal(released.conversation.proposals[0].funds.state, "RELEASED");
      await assert.rejects(disputeServiceCompletion(customer.id, data.conversation.id), (error) => error.statusCode === 409);
    });

    await t.test("QR service also holds funds; dispute blocks automatic release", async () => {
      const data = await fixture({ mode: "QR_PRESENCIAL" });
      const response = await markServiceDelivered(sellerUser.id, data.conversation.id);
      assert.equal(response.conversation.proposals[0].funds.destination, "PIX");
      await disputeServiceCompletion(customer.id, data.conversation.id);
      const transaction = await transactionFor(data);
      const result = await release(transaction.id, new Date(transaction.validada_em.getTime() + 25 * 60 * 60 * 1000));
      assert.equal(result.released, false);
      const disputed = await getServiceConversation(sellerUser.id, data.conversation.id);
      assert.equal(disputed.conversation.proposals[0].funds.state, "DISPUTED");
      const movement = (await getWalletOverview(sellerUser.id)).movements.find((item) => item.originId === transaction.id && item.origem === "VENDA");
      assert.equal(movement.availableAt, null);
      assert.equal(movement.pendingReason, "Em analise pelo suporte");
      assert.equal((await wallet()).saldo_disponivel_centavos, 900n);
    });

    await t.test("legacy customer wait gets one fresh window and is excluded from timeout disputes", async () => {
      const data = await fixture({ status: "AGUARDANDO_CONFIRMACAO" });
      const candidates = await serviceTimeoutRepository.findLegacyDeliveredServices();
      assert.ok(candidates.some((item) => item.id === data.conversation.id));
      const now = new Date();
      const result = await prisma.$transaction((db) => completeLegacyDeliveredService(db, data.conversation.id, now));
      assert.ok(result.earnings.transactionId);
      assert.equal(await prisma.$transaction((db) => completeLegacyDeliveredService(db, data.conversation.id)), null);
      const transaction = await transactionFor(data);
      assert.equal(transaction.validada_em.getTime(), now.getTime());
      assert.equal((await release(transaction.id, new Date(now.getTime() + 24 * 60 * 60 * 1000))).released, true);
      const disputes = await serviceTimeoutRepository.findConversationsAwaitingConfirmation(new Date(Date.now() + 72 * 60 * 60 * 1000));
      assert.equal(disputes.some((item) => item.id === data.conversation.id), false);
    });

    await t.test("unpaid and already disputed services cannot be automatically concluded", async () => {
      const unpaid = await fixture({ paid: false });
      await assert.rejects(markServiceDelivered(sellerUser.id, unpaid.conversation.id), (error) => error.statusCode === 409);
      const disputed = await fixture({ status: "EM_DISPUTA" });
      assert.equal(await prisma.$transaction((db) => completeLegacyDeliveredService(db, disputed.conversation.id)), null);
      assert.equal(await transactionFor(disputed), null);
    });

    await t.test("timeout worker starts the legacy hold once and leaves unpaid QR untouched", async () => {
      const paid = await fixture({ status: "AGUARDANDO_CONFIRMACAO" });
      const unpaid = await fixture({ status: "AGUARDANDO_CONFIRMACAO", paid: false, mode: "QR_PRESENCIAL" });
      const result = await expireUnattendedServices();
      assert.ok(result.completedLegacy >= 1);
      assert.deepEqual(result.failed, []);
      const transaction = await transactionFor(paid);
      assert.equal(transaction.status, "VALIDADA");
      assert.equal((await prisma.conversaServico.findUnique({ where: { id: paid.conversation.id } })).status, "ENCERRADA");
      assert.equal((await prisma.conversaServico.findUnique({ where: { id: unpaid.conversation.id } })).status, "AGUARDANDO_CONFIRMACAO");
      await expireUnattendedServices();
      assert.equal((await transactionFor(paid)).validada_em.getTime(), transaction.validada_em.getTime());
    });
  } finally { await prisma.$disconnect(); }
});
