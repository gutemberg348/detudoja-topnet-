import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/config/prisma.js";
import { marketplaceRepository } from "../src/modules/marketplace/marketplace.repository.js";
import { listMarketplaceProducts } from "../src/modules/marketplace/marketplace.service.js";
import { marketplaceProductsQuerySchema } from "../src/modules/marketplace/marketplace.validator.js";
import { decodeProductCursor, encodeProductCursor, productCursorWhere, productPageOptions } from "../src/modules/marketplace/product-pagination.js";

const date = new Date("2026-10-05T12:00:00.000Z");
const product = (id, overrides = {}) => ({
  id, nome: `Produto ${id}`, destaque: true, criado_em: date, atualizado_em: date, preco_centavos: 1000n,
  loja: { id: 1, nome: "Loja", criado_em: date, categoria: { id: 1, nome: "Beleza", taxa_plataforma_percentual: 10 } },
  ...overrides,
});

test("product query validates bounded page sizes, cursors and existing filters", () => {
  assert.deepEqual(marketplaceProductsQuerySchema.parse({ limit: "12", categoryId: "2", search: " shampoo " }), { limit: 12, categoryId: 2, search: "shampoo" });
  for (const limit of [0, -1, 51, 1.5, "abc"]) assert.equal(marketplaceProductsQuerySchema.safeParse({ limit }).success, false);
  assert.equal(marketplaceProductsQuerySchema.safeParse({ cursor: "a".repeat(513) }).success, false);
  assert.equal(marketplaceProductsQuerySchema.safeParse({ cursor: "invalid/cursor" }).success, false);
  assert.equal(productPageOptions({}), null);
});

test("cursor survives a deleted product and breaks tied timestamps by product ID", () => {
  const cursor = decodeProductCursor(encodeProductCursor(product(20)));
  assert.equal(cursor.id, 20);
  assert.equal(cursor.featured, true);
  assert.equal(cursor.date.toISOString(), date.toISOString());
  const boundary = productCursorWhere(cursor);
  assert.deepEqual(boundary.OR[0], { destaque: false });
  assert.deepEqual(boundary.OR.at(-1), { destaque: true, criado_em: date, id: { lt: 20 } });
  const ordinary = productCursorWhere(decodeProductCursor(encodeProductCursor(product(5, { destaque: false }))));
  assert.equal(ordinary.OR.some((entry) => entry.destaque === true), false);
});

test("malformed cursor fields are rejected before any database operation", async () => {
  for (const value of ["x", "bad/cursor", Buffer.from(JSON.stringify({ v: 1, id: -1, featured: true, createdAt: date.toISOString() })).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, id: Number.MAX_SAFE_INTEGER, featured: true, createdAt: date.toISOString() })).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, id: 1, featured: true, createdAt: "bad date" })).toString("base64url")]) {
    await assert.rejects(listMarketplaceProducts(1, { limit: 12, cursor: value }), (error) => error.statusCode === 400);
  }
});

test("repository limits database rows and preserves city, category, publication and KYC filters for every page", async (t) => {
  let query;
  // Prisma delegates are proxies whose method descriptors have no value.
  const original = prisma.produtoLoja.findMany;
  prisma.produtoLoja.findMany = async (value) => { query = value; return []; };
  t.after(() => { prisma.produtoLoja.findMany = original; });
  const page = productPageOptions({ limit: 12, cursor: encodeProductCursor(product(20)) });
  await marketplaceRepository.listProducts({ cidade: "Patos", estado: "PB" }, { categoryId: 2, productIds: [5, 10], page });
  assert.equal(query.take, 13);
  assert.deepEqual(query.orderBy, [{ destaque: "desc" }, { criado_em: "desc" }, { id: "desc" }]);
  assert.equal(query.where.loja.endereco.is.estado, "PB");
  assert.equal(query.where.loja.endereco.is.OR[0].cidade_normalizada, "patos");
  assert.equal(query.where.loja.categoria_id, 2);
  assert.equal(query.where.loja.visivel_no_app, true);
  assert.equal(query.where.loja.lojista.is.usuario.is.nivel_kyc, "TIER_2");
  assert.equal(query.where.status, "ATIVO");
  assert.equal(query.where.excluido_em, null);
  assert.deepEqual(query.where.id.in, [5, 10]);
  assert.deepEqual(query.where.AND, [productCursorWhere(page.cursor)]);
});

function stubCatalog(t, rows) {
  t.mock.method(marketplaceRepository, "getBaseAddress", async () => ({ cidade: "Patos", estado: "PB" }));
  t.mock.method(marketplaceRepository, "getEarningsDistribution", async () => ({}));
  t.mock.method(marketplaceRepository, "getPaymentPolicy", async () => ({}));
  t.mock.method(marketplaceRepository, "listProducts", async (_address, { page }) => rows.slice(0, page ? page.limit + 1 : 50));
}

test("API returns twelve products, one continuation cursor and never serializes the extra lookahead row", async (t) => {
  stubCatalog(t, Array.from({ length: 13 }, (_, index) => product(30 - index)));
  const response = await listMarketplaceProducts(1, { limit: 12 });
  assert.equal(response.products.length, 12);
  assert.equal(response.pagination.hasMore, true);
  assert.equal(decodeProductCursor(response.pagination.nextCursor).id, 19);
  assert.equal(response.products.at(-1).product.id, 19);
});

test("last page clears the cursor, and installed older apps retain the array-only contract", async (t) => {
  stubCatalog(t, [product(1)]);
  const paged = await listMarketplaceProducts(1, { limit: 12 });
  assert.deepEqual(paged.pagination, { limit: 12, hasMore: false, nextCursor: null });
  const legacy = await listMarketplaceProducts(1);
  assert.equal(legacy.products.length, 1);
  assert.equal("pagination" in legacy, false);
});

test("filtered service products cannot prematurely end the paginated catalog", async (t) => {
  stubCatalog(t, [product(3, { loja: { id: 1, categoria: { nome: "Serviços" } } }), product(2)]);
  const response = await listMarketplaceProducts(1, { limit: 1 });
  assert.equal(response.products.length, 0);
  assert.equal(response.pagination.hasMore, true);
  assert.equal(decodeProductCursor(response.pagination.nextCursor).id, 3);
});
