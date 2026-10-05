import { AppError } from "../../utils/errors.js";

export function productPageOptions(query = {}) {
  // Keep installed older apps compatible; new apps explicitly request a page.
  if (query.limit === undefined && !query.cursor) return null;
  const limit = Number(query.limit ?? 12);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new AppError("Quantidade de produtos invalida", 400);
  }
  return { limit, cursor: query.cursor ? decodeProductCursor(query.cursor) : null };
}

export function encodeProductCursor(product) {
  return Buffer.from(JSON.stringify({
    v: 1, id: product.id, featured: product.destaque, createdAt: product.criado_em.toISOString(),
  })).toString("base64url");
}

export function decodeProductCursor(value) {
  try {
    if (typeof value !== "string" || value.length > 512 || !/^[\w-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString());
    const date = new Date(cursor.createdAt);
    if (cursor.v !== 1 || !Number.isSafeInteger(cursor.id) || cursor.id <= 0 || cursor.id > 2147483647
      || typeof cursor.featured !== "boolean" || typeof cursor.createdAt !== "string"
      || !Number.isFinite(date.getTime()) || date.toISOString() !== cursor.createdAt) throw new Error();
    return { ...cursor, date };
  } catch {
    throw new AppError("Pagina de produtos invalida. Atualize a busca e tente novamente.", 400);
  }
}

export function productCursorWhere(cursor) {
  if (!cursor) return {};
  return { OR: [
    ...(cursor.featured ? [{ destaque: false }] : []),
    { destaque: cursor.featured, criado_em: { lt: cursor.date } },
    { destaque: cursor.featured, criado_em: cursor.date, id: { lt: cursor.id } },
  ] };
}
