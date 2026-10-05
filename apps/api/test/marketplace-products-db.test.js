import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/config/prisma.js";
import { listMarketplaceProducts } from "../src/modules/marketplace/marketplace.service.js";

test("PostgreSQL pagination visits 61 products once, survives deleted cursor rows and excludes other cities/stores", {
  skip: process.env.MARKETPLACE_DB_TESTS !== "true",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/marketplace_validation"), "Use an isolated marketplace_validation database");
  const suffix = randomUUID();
  let owner;
  let category;
  let merchant;
  const storeIds = [];
  try {
    owner = await prisma.usuario.create({ data: {
      nome: "Product pagination test", email: `${suffix}@products-test.local`, senha_hash: "unused", status: "ATIVO",
      nivel_kyc: "TIER_2", cidade_busca: "Patos", estado_busca: "PB",
      kyc: { create: { tipo_pessoa: "FISICA", status: "APROVADO" } },
    } });
    merchant = await prisma.lojista.create({ data: { usuario_id: owner.id, tipo_pessoa: "FISICA", status: "ATIVO", status_kyc: "APROVADO" } });
    category = await prisma.categoriaLoja.create({ data: { nome: `Pagination ${suffix}` } });
    for (const [city, visible] of [["Patos", true], ["Outra cidade", true], ["Patos", false]]) {
      const store = await prisma.loja.create({ data: {
        nome: "Products test store", slug: `${suffix}-${storeIds.length}`, lojista_id: merchant.id, categoria_id: category.id,
        status: "ATIVA", visivel_no_app: visible,
        endereco: { create: { cep: "58700000", estado: "PB", cidade: city, cidade_normalizada: city.toLowerCase(), bairro: "Centro", rua: "Teste", numero: "1" } },
      } });
      storeIds.push(store.id);
    }
    const date = new Date("2026-10-05T12:00:00.000Z");
    await prisma.produtoLoja.createMany({ data: Array.from({ length: 61 }, (_, index) => ({
      loja_id: storeIds[0], nome: `Produto ${index}`, preco_centavos: 1000n, destaque: index % 5 === 0, criado_em: date,
    })).concat(storeIds.slice(1).map((loja_id) => ({ loja_id, nome: "Must not appear", preco_centavos: 1000n, destaque: true, criado_em: date }))) });
    const original = (await prisma.produtoLoja.findMany({ where: { loja_id: storeIds[0] } }))
      .sort((a, b) => Number(b.destaque) - Number(a.destaque) || b.criado_em - a.criado_em || b.id - a.id);
    const first = await listMarketplaceProducts(owner.id, { categoryId: category.id, limit: 12 });
    assert.equal(first.products.length, 12);
    const seen = first.products.map((entry) => entry.product.id);
    await prisma.produtoLoja.delete({ where: { id: seen.at(-1) } });
    const inserted = await prisma.produtoLoja.create({ data: { loja_id: storeIds[0], nome: "Inserted ahead of cursor", preco_centavos: 1000n, destaque: true, criado_em: new Date(date.getTime() + 1000) } });
    let pagination = first.pagination;
    let pages = 1;
    while (pagination.hasMore) {
      const response = await listMarketplaceProducts(owner.id, { categoryId: category.id, limit: 12, cursor: pagination.nextCursor });
      assert.ok(response.products.length <= 12);
      seen.push(...response.products.map((entry) => entry.product.id));
      pagination = response.pagination;
      assert.ok(++pages <= 6, "Pagination must terminate");
    }
    assert.equal(pages, 6);
    assert.equal(seen.length, 61);
    assert.equal(new Set(seen).size, 61);
    assert.deepEqual(seen, original.map((entry) => entry.id));
    assert.equal(seen.includes(inserted.id), false);
    assert.equal(pagination.nextCursor, null);
  } finally {
    if (storeIds.length) {
      await prisma.produtoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
      await prisma.enderecoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
      await prisma.loja.deleteMany({ where: { id: { in: storeIds } } });
    }
    if (merchant) await prisma.lojista.delete({ where: { id: merchant.id } });
    if (category) await prisma.categoriaLoja.delete({ where: { id: category.id } });
    if (owner) await prisma.usuario.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
});
