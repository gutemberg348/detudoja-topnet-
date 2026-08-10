import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { defaultSegmentFeePercent } from "../earnings/order-earnings.config.js";
import { serializeSalesSegment } from "./admin.serializer.js";

const segmentInclude = {
  _count: { select: { lojas: true, vendedores: true, vendas_autonomas: true } },
  categoria_loja: { select: { id: true, nome: true } },
};

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureUniqueSegmentName(name, ignoredId) {
  const slug = slugify(name);
  const segment = await prisma.segmentoVenda.findFirst({
    select: { id: true },
    where: {
      OR: [
        { nome: { equals: name, mode: "insensitive" } },
        { slug },
      ],
      excluido_em: null,
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
    },
  });

  if (segment) {
    throw new AppError("Ja existe um segmento com este nome", 409);
  }

  return slug;
}

async function ensureActiveCategory(categoryId) {
  const category = await prisma.categoriaLoja.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: categoryId, status: "ATIVA" },
  });

  if (!category) {
    throw new AppError("Categoria nao encontrada ou inativa", 404);
  }

  return category;
}

export async function listAdminSalesSegments(query = {}) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const segments = await prisma.segmentoVenda.findMany({
    include: segmentInclude,
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    where: {
      excluido_em: null,
      ...(search
        ? { nome: { contains: search, mode: "insensitive" } }
        : {}),
      ...(["ATIVO", "INATIVO"].includes(status) ? { status } : {}),
    },
  });

  return { segments: segments.map(serializeSalesSegment) };
}

export async function createAdminSalesSegment(data) {
  const [slug, category] = await Promise.all([
    ensureUniqueSegmentName(data.name),
    ensureActiveCategory(data.categoryId),
  ]);
  const segment = await prisma.segmentoVenda.create({
    data: {
      categoria_loja_id: category.id,
      descricao: data.description || null,
      icone: data.iconName || null,
      nome: data.name,
      negocia_pedido_por_chat: data.orderFlow === "CHAT_NEGOTIATION",
      ordem: data.sortOrder,
      slug,
      status: data.status,
      taxa_plataforma_percentual: data.feePercent ?? defaultSegmentFeePercent,
      ...(data.feePercent !== undefined
        ? { taxa_plataforma_atualizada_em: new Date() }
        : {}),
    },
    include: segmentInclude,
  });

  return { segment: serializeSalesSegment(segment) };
}

export async function updateAdminSalesSegment(segmentId, data) {
  const parsedSegmentId = parsePositiveId(segmentId, "Segmento invalido");
  const existing = await prisma.segmentoVenda.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: parsedSegmentId },
  });

  if (!existing) {
    throw new AppError("Segmento nao encontrado", 404);
  }

  const slug = data.name
    ? await ensureUniqueSegmentName(data.name, parsedSegmentId)
    : undefined;
  const category = data.categoryId
    ? await ensureActiveCategory(data.categoryId)
    : null;

  const segment = await prisma.segmentoVenda.update({
    data: {
      ...(category ? { categoria_loja_id: category.id } : {}),
      ...(data.description !== undefined
        ? { descricao: data.description || null }
        : {}),
      ...(data.iconName !== undefined ? { icone: data.iconName || null } : {}),
      ...(data.name ? { nome: data.name, slug } : {}),
      ...(data.orderFlow !== undefined
        ? { negocia_pedido_por_chat: data.orderFlow === "CHAT_NEGOTIATION" }
        : {}),
      ...(data.sortOrder !== undefined ? { ordem: data.sortOrder } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.feePercent !== undefined
        ? {
            taxa_plataforma_atualizada_em: new Date(),
            taxa_plataforma_percentual: data.feePercent,
          }
        : {}),
    },
    include: segmentInclude,
    where: { id: parsedSegmentId },
  });

  return { segment: serializeSalesSegment(segment) };
}

export async function deleteAdminSalesSegment(segmentId) {
  const parsedSegmentId = parsePositiveId(segmentId, "Segmento invalido");
  const existing = await prisma.segmentoVenda.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: parsedSegmentId },
  });

  if (!existing) {
    throw new AppError("Segmento nao encontrado", 404);
  }

  await prisma.segmentoVenda.update({
    data: { excluido_em: new Date(), status: "INATIVO" },
    where: { id: parsedSegmentId },
  });
}
