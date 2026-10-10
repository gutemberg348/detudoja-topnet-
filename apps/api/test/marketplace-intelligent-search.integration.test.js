import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/config/prisma.js";
import { marketplaceSearchRepository } from "../src/modules/marketplace/marketplace-search.repository.js";
import { listMarketplaceProducts, listMarketplaceSuggestions } from "../src/modules/marketplace/marketplace.service.js";

const db = new URL(process.env.DATABASE_URL);
const enabled = ["localhost", "127.0.0.1"].includes(db.hostname) && db.pathname === "/intelligent_search_validation";
const marker = `search-${Date.now()}`;
const state = {};
const address = { cep: "58700000", cidade: "Patos", cidade_normalizada: "patos", estado: "PB", bairro: "Centro", rua: "Teste", numero: "1" };

before(async () => {
  if (!enabled) return;
  state.user = await prisma.usuario.create({ data: {
    nome: marker, email: `${marker}@test.local`, senha_hash: "unused", status: "ATIVO", nivel_kyc: "TIER_2",
    cidade_busca: "Patos", estado_busca: "PB", kyc: { create: { tipo_pessoa: "FISICA", status: "APROVADO" } },
    enderecos: { create: address },
  } });
  state.owner = await prisma.lojista.create({ data: { usuario_id: state.user.id, tipo_pessoa: "FISICA", status: "ATIVO", status_kyc: "APROVADO" } });
  state.category = await prisma.categoriaLoja.create({ data: { nome: "Alimentação" } });
  state.stores = [];
  for (const [index, city, visible] of [[0, "Patos", true], [1, "Sousa", true], [2, "Patos", false]]) {
    const store = await prisma.loja.create({ data: {
      nome: index === 0 ? "Hamburgueria Central" : `Oculta ${index}`, slug: `${marker}-${index}`, lojista_id: state.owner.id,
      categoria_id: state.category.id, status: "ATIVA", visivel_no_app: visible,
      endereco: { create: { ...address, cidade: city, cidade_normalizada: city.toLowerCase() } },
    } });
    state.stores.push(store);
    await prisma.produtoLoja.createMany({ data: (index === 0
      ? ["Hambúrguer", "Pizza de frango", "Pizza de queijo", "iPhone 12", "iPhone 123", ...Array.from({ length: 45 }, (_, i) => `Hambúrguer artesanal ${i}`)]
      : ["Xenoburger secreto"]).map((nome) => ({ nome, loja_id: store.id, preco_centavos: 1000, status: "ATIVO" })) });
  }
  state.seller = await prisma.vendedor.create({ data: { usuario_id: state.user.id, nome_publico: marker, status: "ATIVO", status_kyc: "APROVADO" } });
  state.types = [];
  for (const name of ["Eletricista", "Mototaxi", "Motoboy"]) {
    const type = await prisma.tipoServico.create({ data: { nome: name, slug: `${marker}-${name.toLowerCase()}` } });
    state.types.push(type);
    await prisma.servicoVendedor.create({ data: { vendedor_id: state.seller.id, tipo_servico_id: type.id, nome: name, disponivel_agora: true } });
  }
});

after(async () => {
  if (state.user) {
    const storeIds = (state.stores ?? []).map((store) => store.id);
    await prisma.produtoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
    await prisma.enderecoLoja.deleteMany({ where: { loja_id: { in: storeIds } } });
    await prisma.loja.deleteMany({ where: { id: { in: storeIds } } });
    if (state.seller) {
      await prisma.servicoVendedor.deleteMany({ where: { vendedor_id: state.seller.id } });
      await prisma.vendedor.delete({ where: { id: state.seller.id } });
    }
    await prisma.tipoServico.deleteMany({ where: { slug: { startsWith: marker } } });
    if (state.owner) await prisma.lojista.delete({ where: { id: state.owner.id } });
    if (state.category) await prisma.categoriaLoja.delete({ where: { id: state.category.id } });
    await prisma.usuario.delete({ where: { id: state.user.id } });
  }
  await prisma.$disconnect();
});

test("indexed typo suggestions use the local public catalog and generic service intent", { skip: !enabled }, async () => {
  const labels = await marketplaceSearchRepository.candidateLabels(["hagurg", "xenoburger"], address);
  assert.ok(labels.some((label) => label.includes("hamburguer")));
  assert.equal(labels.some((label) => label.includes("xenoburger")), false);
  for (const [search, expected] of [["hagurg", "Hambúrguer"], ["eletrisista", "Eletricista"], ["mototxi", "Mototaxi"]]) {
    const result = await listMarketplaceSuggestions(state.user.id, { search, limit: 12 });
    assert.ok(result.suggestions.some((item) => item.label === expected), search);
    assert.equal(result.searchInfo.discovery, false);
    if (search === "mototxi") assert.equal(result.suggestions.some((item) => item.label === "Motoboy"), false);
  }
  const services = await listMarketplaceSuggestions(state.user.id, { search: "srvico" });
  assert.ok(services.suggestions.some((item) => item.type === "service"));
});

test("multiword correction preserves meaning and product cursor pagination", { skip: !enabled }, async () => {
  const pizza = await listMarketplaceProducts(state.user.id, { search: "piza frnago", limit: 12 });
  assert.deepEqual(pizza.products.map((item) => item.product.name), ["Pizza de frango"]);
  const first = await listMarketplaceProducts(state.user.id, { search: "hagurg", limit: 12 });
  assert.equal(first.products.length, 12);
  assert.equal(first.pagination.hasMore, true);
  const second = await listMarketplaceProducts(state.user.id, { search: "hagurg", limit: 12, cursor: first.pagination.nextCursor });
  assert.ok(second.products.length > 0);
  assert.equal(second.products.some((item) => first.products.some((other) => other.product.id === item.product.id)), false);
  const exact = await listMarketplaceSuggestions(state.user.id, { search: "hamburguer", limit: 6 });
  assert.equal(exact.suggestions[0].label, "Hambúrguer");
  const number = await listMarketplaceProducts(state.user.id, { search: "iphone 12", limit: 12 });
  assert.deepEqual(number.products.map((item) => item.product.name), ["iPhone 12"]);
});

test("no match returns clearly identified city suggestions, never fake matches", { skip: !enabled }, async () => {
  const result = await listMarketplaceSuggestions(state.user.id, { search: "zzzzzzzzz" });
  assert.equal(result.searchInfo.discovery, true);
  assert.ok(result.suggestions.length);
  assert.deepEqual(result.searchInfo.suggestedTerms, []);
  const oneLetter = await listMarketplaceSuggestions(state.user.id, { search: "h" });
  assert.ok(oneLetter.suggestions.length);
  const products = await listMarketplaceProducts(state.user.id, { search: "zzzzzzzzz", limit: 12 });
  assert.deepEqual(products.products, []);
});

test("migration exposes an indexable trigram query and normalizes Portuguese names", { skip: !enabled }, async () => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return tx.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) SELECT id FROM produtos_loja
      WHERE excluido_em IS NULL AND marketplace_search_normalize(nome || ' ' || coalesce(marca, '')) %> $1`, "hamburguer");
  });
  assert.match(JSON.stringify(result), /marketplace_product_name_trgm/);
  const normalized = await prisma.$queryRawUnsafe("SELECT marketplace_search_normalize($1) AS value", "Açaí e Pão");
  assert.equal(normalized[0].value, "acai e pao");
});
