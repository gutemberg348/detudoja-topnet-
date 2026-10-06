import assert from "node:assert/strict";
import { test } from "node:test";
import { sellerRepository } from "../src/modules/seller/seller.repository.js";
import { createAutonomousSale } from "../src/modules/seller/seller.service.js";

const autonomousSegment = { id: 10, nome: "Venda autonoma", slug: "venda-autonoma", status: "ATIVO" };
const otherSegment = { id: 20, nome: "Servicos", slug: "servicos", status: "ATIVO" };

function setup(t, { segment = autonomousSegment, tier = "TIER_2", payout = true, sellerExists = true } = {}) {
  const user = { id: 901, cpf: "52998224725", status: "ATIVO", nivel_kyc: tier, kyc: { status: "APROVADO" } };
  const seller = { id: 902, usuario_id: user.id, cpf: user.cpf, tipo_pessoa: "FISICA", status: "ATIVO", status_kyc: "APROVADO", segmento_venda_id: otherSegment.id, segmento_venda: otherSegment };
  const writes = [];
  let sale;
  const database = {
    contaBancaria: { findFirst: async ({ where }) => {
      assert.equal(where.usuario_id, user.id);
      return payout ? { id: 1, status: "ATIVA" } : null;
    } },
    vendaAutonoma: { create: async ({ data }) => {
      writes.push({ type: "sale", data });
      sale = { ...data, id: 903, segmento_venda: segment, criado_em: new Date(), atualizado_em: new Date() };
      return sale;
    } },
    cobranca: { create: async ({ data }) => {
      writes.push({ type: "charge", data });
      return { ...data, id: 904, status: "ATIVA", criado_em: new Date(), vendedor: seller, venda_autonoma: sale };
    } },
  };
  t.mock.method(sellerRepository, "findUniqueUser", async () => user);
  t.mock.method(sellerRepository, "findFirstSeller", async () => sellerExists ? seller : null);
  t.mock.method(sellerRepository, "findFirstSegment", async ({ where }) => {
    assert.deepEqual(where, { excluido_em: null, slug: "venda-autonoma", status: "ATIVO" });
    return segment;
  });
  t.mock.method(sellerRepository, "transaction", async (work) => work(database));
  return { seller, user, writes };
}

test("venda avulsa usa categoria autonoma sem alterar o segmento do prestador/lojista", async (t) => {
  const { seller, user, writes } = setup(t);
  const result = await createAutonomousSale(user.id, { title: "Venda avulsa", amountCents: 1000 });
  assert.equal(writes[0].data.segmento_venda_id, autonomousSegment.id);
  assert.equal(seller.segmento_venda_id, otherSegment.id);
  assert.equal(result.sale.segment.slug, "venda-autonoma");
  assert.equal(result.charge.merchant.segment, "Venda autonoma");
  assert.equal(writes[1].data.origem, "AVULSA");
  assert.equal(writes[1].data.loja_id, undefined);
  assert.equal(writes[1].data.venda_autonoma_id, result.sale.id);
  assert.match(result.qrImageDataUrl, /^data:image\/png;base64,/);
});

test("categoria autonoma indisponivel bloqueia a venda sem herdar outra taxa", async (t) => {
  const { user, writes } = setup(t, { segment: null });
  await assert.rejects(createAutonomousSale(user.id, { title: "Venda", amountCents: 1000 }),
    (error) => error.statusCode === 409);
  assert.deepEqual(writes, []);
});

test("venda autonoma continua exigindo verificacao e perfil proprio", async (t) => {
  for (const options of [{ tier: "TIER_1" }, { sellerExists: false }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const { user, writes } = setup(t, options);
      await assert.rejects(createAutonomousSale(user.id, { title: "Venda", amountCents: 1000 }),
        (error) => error.statusCode === 428);
      assert.deepEqual(writes, []);
    });
  }
});

test("sem conta Pix pessoal nao cria cobranca autonoma", async (t) => {
  const { user, writes } = setup(t, { payout: false });
  await assert.rejects(createAutonomousSale(user.id, { title: "Venda", amountCents: 1000 }),
    (error) => error.statusCode === 428 && error.message.includes("chave Pix"));
  assert.equal(writes.some((write) => write.type === "charge"), false);
});
