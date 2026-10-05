import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../src/config/prisma.js";
import { completeServiceOutsideApp, cancelServiceConversation } from "../src/modules/service-chats/service-chats.service.js";
import { payChargeWithWallet } from "../src/modules/charges/charge.service.js";
import { completeServiceOutsideAppInTransaction, cancelUnpaidServiceInTransaction, lockServiceProposalChanges } from "../src/modules/service-chats/service-closure.js";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("external service closure preserves finances, invalidates QR and competes atomically with payment", {
  skip: process.env.SERVICE_CLOSURE_DB_TESTS !== "true",
}, async (t) => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/service_validation",
    "Use an isolated local service_validation database");
  const marker = randomUUID();
  const users = [];
  let seller;
  let segment;
  let walletType;
  const paymentIds = [];
  async function fixture(overrides = {}) {
    const conversation = await prisma.conversaServico.create({ data: {
      cliente_usuario_id: users[1].id, vendedor_id: seller.id, segmento_venda_id: segment.id, status: "ACORDADA",
    } });
    const proposal = await prisma.propostaServico.create({ data: {
      conversa_servico_id: conversation.id, vendedor_id: seller.id,
      valor_centavos: 5000n, forma_pagamento: "QR_PRESENCIAL", status: "ACEITA", ...overrides,
    } });
    const charge = await prisma.cobranca.create({ data: {
      codigo_publico: `DTJ-${randomUUID().replaceAll("-", "").toUpperCase()}`,
      criador_usuario_id: users[0].id, vendedor_id: seller.id, proposta_servico_id: proposal.id,
      origem: "PRESENCIAL", titulo: "Service closure test", valor_centavos: 5000n,
    } });
    return { conversation, proposal, charge };
  }
  const financeModels = ["pagamento", "transacaoComercial", "lancamentoCarteira", "lancamentoPlataforma",
    "recompensa", "recebivel", "repassePix", "eventoFinanceiro"];
  async function finances() {
    return {
      counts: await Promise.all(financeModels.map((model) => prisma[model].count())),
      wallets: await prisma.carteira.findMany({ where: { tipo_carteira_id: walletType.id }, orderBy: { id: "asc" } }),
    };
  }
  const close = (data, userId = users[0].id, proposalId = data.proposal.id) => prisma.$transaction((db) => (
    completeServiceOutsideAppInTransaction(db, userId, data.conversation.id, proposalId)
  ));
  const cancel = (data, userId = users[0].id) => prisma.$transaction((db) => (
    cancelUnpaidServiceInTransaction(db, userId, data.conversation.id)
  ));
  const hasStatus = (statusCode) => (error) => error.statusCode === statusCode;
  try {
    for (const [index, name] of ["Provider", "Customer", "Outsider"].entries()) {
      users.push(await prisma.usuario.create({ data: {
        nome: name, email: `${index}-${marker}@closure-test.local`, senha_hash: "unused", status: "ATIVO",
        nivel_kyc: "TIER_2", ...(index === 1 ? { cpf: "39053344705" } : {}),
        kyc: { create: { tipo_pessoa: "FISICA", status: "APROVADO" } },
      } }));
    }
    segment = await prisma.segmentoVenda.create({ data: { nome: "Closure test", slug: marker, atende_por_chat: true } });
    seller = await prisma.vendedor.create({ data: {
      usuario_id: users[0].id, segmento_venda_id: segment.id, nome_publico: "Provider", status: "ATIVO", status_kyc: "APROVADO",
    } });
    walletType = await prisma.tipoCarteira.create({ data: { codigo: marker, nome: "Closure wallet" } });
    await prisma.carteira.createMany({ data: users.slice(0, 2).map((user) => ({
      usuario_id: user.id, tipo_carteira_id: walletType.id, saldo_disponivel_centavos: 25000n,
    })) });

    await t.test("seller records external receipt once; serialized chat/QR distinguish it from app payment", async () => {
      const data = await fixture();
      const before = await finances();
      const response = await completeServiceOutsideApp(users[0].id, data.conversation.id, { proposalId: data.proposal.id });
      assert.equal(response.conversation.status, "ENCERRADA");
      assert.equal(response.conversation.proposals[0].completedOutsideApp, true);
      assert.equal(response.charge.serviceCompletedOutsideApp, true);
      assert.equal(response.charge.status, "CANCELADA");
      assert.equal(response.charge.payment, null);
      const proposal = await prisma.propostaServico.findUnique({ where: { id: data.proposal.id } });
      assert.ok(proposal.concluido_em);
      assert.equal(proposal.pago_em, null);
      await completeServiceOutsideApp(users[0].id, data.conversation.id, { proposalId: data.proposal.id });
      assert.equal(await prisma.conversaServicoMensagem.count({ where: { conversa_servico_id: data.conversation.id } }), 1);
      await assert.rejects(payChargeWithWallet(users[1].id, data.charge.codigo_publico), hasStatus(409));
      assert.deepEqual(await finances(), before, "No wallet debit, payment, pool, rewards or payout may be created");
    });

    await t.test("customer cannot claim external receipt, outsider cannot access and proposals must belong to this chat", async () => {
      const data = await fixture();
      const other = await fixture();
      await assert.rejects(close(data, users[1].id), hasStatus(403));
      await assert.rejects(close(data, users[2].id), hasStatus(404));
      await assert.rejects(close(data, users[0].id, other.proposal.id), hasStatus(404));
      assert.equal((await prisma.cobranca.findUnique({ where: { id: data.charge.id } })).status, "ATIVA");
    });

    await t.test("online, pending and already paid proposals cannot be converted into external receipt", async () => {
      for (const override of [{ forma_pagamento: "ONLINE" }, { status: "PENDENTE" }, { status: "PAGA", pago_em: new Date() }]) {
        const data = await fixture(override);
        await assert.rejects(close(data), hasStatus(409));
        assert.equal((await prisma.cobranca.findUnique({ where: { id: data.charge.id } })).status, "ATIVA");
      }
    });

    await t.test("processing/paid charges and linked pending payment block cancellation and external receipt", async () => {
      for (const status of ["PROCESSANDO", "PAGA", "ATIVA"]) {
        const data = await fixture();
        const payment = await prisma.pagamento.create({ data: {
          usuario_pagador_id: users[1].id, vendedor_id: seller.id, valor_total_centavos: 5000n,
          metodo_principal: "PIX", status: status === "PAGA" ? "PAGO" : "PENDENTE",
        } });
        paymentIds.push(payment.id);
        await prisma.cobranca.update({ where: { id: data.charge.id }, data: { status, pagamento_id: payment.id } });
        const before = await finances();
        await assert.rejects(close(data), hasStatus(409));
        await assert.rejects(cancel(data), hasStatus(409));
        assert.deepEqual(await finances(), before);
        assert.equal((await prisma.cobranca.findUnique({ where: { id: data.charge.id } })).status, status);
      }
    });

    await t.test("either participant can cancel unpaid service; repeated cancellation is harmless and old QR is rejected", async () => {
      for (const user of users.slice(0, 2)) {
        const data = await fixture();
        const before = await finances();
        const response = await cancelServiceConversation(user.id, data.conversation.id);
        assert.equal(response.conversation.status, "CANCELADA");
        assert.equal(response.conversation.proposals[0].status, "CANCELADA");
        await cancelServiceConversation(user.id, data.conversation.id);
        assert.equal(await prisma.conversaServicoMensagem.count({ where: { conversa_servico_id: data.conversation.id } }), 1);
        await assert.rejects(payChargeWithWallet(users[1].id, data.charge.codigo_publico), hasStatus(409));
        assert.deepEqual(await finances(), before);
      }
    });

    await t.test("payment holding charge lock wins against a stale external-receipt request", async () => {
      const data = await fixture();
      const held = deferred();
      const release = deferred();
      const attempting = deferred();
      const payment = prisma.$transaction(async (db) => {
        const claim = await db.cobranca.updateMany({ where: { id: data.charge.id, status: "ATIVA" }, data: { status: "PROCESSANDO" } });
        assert.equal(claim.count, 1);
        held.resolve();
        await release.promise;
      });
      await held.promise;
      const external = prisma.$transaction((db) => completeServiceOutsideAppInTransaction({
        ...db, cobranca: { updateMany: (args) => { attempting.resolve(); return db.cobranca.updateMany(args); } },
      }, users[0].id, data.conversation.id, data.proposal.id));
      const rejected = assert.rejects(external, hasStatus(409));
      await attempting.promise;
      release.resolve();
      await Promise.all([payment, rejected]);
      assert.equal((await prisma.conversaServico.findUnique({ where: { id: data.conversation.id } })).status, "ACORDADA");
      assert.equal((await prisma.propostaServico.findUnique({ where: { id: data.proposal.id } })).status, "ACEITA");
      assert.equal(await prisma.conversaServicoMensagem.count({ where: { conversa_servico_id: data.conversation.id } }), 0);
    });

    await t.test("external receipt holding charge lock prevents a concurrent payment claim", async () => {
      const data = await fixture();
      const held = deferred();
      const release = deferred();
      const before = await finances();
      const external = prisma.$transaction(async (db) => {
        await completeServiceOutsideAppInTransaction(db, users[0].id, data.conversation.id, data.proposal.id);
        held.resolve();
        await release.promise;
      });
      await held.promise;
      const payment = prisma.$transaction((db) => db.cobranca.updateMany({
        where: { id: data.charge.id, status: "ATIVA" }, data: { status: "PROCESSANDO" },
      }));
      release.resolve();
      const [, claim] = await Promise.all([external, payment]);
      assert.equal(claim.count, 0);
      assert.equal((await prisma.cobranca.findUnique({ where: { id: data.charge.id } })).status, "CANCELADA");
      assert.deepEqual(await finances(), before);
    });

    await t.test("simultaneous cancellation and external receipt produce one terminal state and one audit message", async () => {
      const data = await fixture();
      const results = await Promise.allSettled([close(data), cancel(data)]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.find((result) => result.status === "rejected").reason.statusCode, 409);
      assert.equal(await prisma.conversaServicoMensagem.count({ where: { conversa_servico_id: data.conversation.id } }), 1);
      assert.equal((await prisma.cobranca.findUnique({ where: { id: data.charge.id } })).status, "CANCELADA");
    });

    await t.test("cancellation waits for accepting a proposal and invalidates the newly created charge", async () => {
      const data = await fixture({ status: "PENDENTE" });
      await prisma.cobranca.delete({ where: { id: data.charge.id } });
      const held = deferred();
      const release = deferred();
      const attempting = deferred();
      const acceptance = prisma.$transaction(async (db) => {
        await lockServiceProposalChanges(db, data.conversation.id);
        await db.propostaServico.update({ where: { id: data.proposal.id }, data: { status: "ACEITA" } });
        const { id, criado_em, atualizado_em, ...chargeData } = data.charge;
        const charge = await db.cobranca.create({ data: chargeData });
        held.resolve();
        await release.promise;
        return charge;
      });
      await held.promise;
      const cancellation = prisma.$transaction((db) => cancelUnpaidServiceInTransaction({
        ...db, $queryRaw: (...args) => { attempting.resolve(); return db.$queryRaw(...args); },
      }, users[1].id, data.conversation.id));
      await attempting.promise;
      release.resolve();
      const [charge] = await Promise.all([acceptance, cancellation]);
      assert.equal((await prisma.cobranca.findUnique({ where: { id: charge.id } })).status, "CANCELADA");
      assert.equal((await prisma.conversaServico.findUnique({ where: { id: data.conversation.id } })).status, "CANCELADA");
      assert.equal((await prisma.propostaServico.findUnique({ where: { id: data.proposal.id } })).status, "CANCELADA");
      await assert.rejects(payChargeWithWallet(users[1].id, charge.codigo_publico), hasStatus(409));
    });
  } finally {
    if (seller) {
      await prisma.cobranca.deleteMany({ where: { vendedor_id: seller.id } });
      await prisma.conversaServico.deleteMany({ where: { vendedor_id: seller.id } });
      if (paymentIds.length) await prisma.pagamento.deleteMany({ where: { id: { in: paymentIds } } });
      await prisma.vendedor.delete({ where: { id: seller.id } });
    }
    if (walletType) {
      await prisma.carteira.deleteMany({ where: { tipo_carteira_id: walletType.id } });
      await prisma.tipoCarteira.delete({ where: { id: walletType.id } });
    }
    if (segment) await prisma.segmentoVenda.delete({ where: { id: segment.id } });
    if (users.length) {
      const ids = users.map((user) => user.id);
      await prisma.notificacaoPush.deleteMany({ where: { destinatario_usuario_id: { in: ids } } });
      await prisma.kycUsuario.deleteMany({ where: { usuario_id: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  }
});
