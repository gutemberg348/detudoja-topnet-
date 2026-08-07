import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { serializeAdminServiceType } from "./admin.serializer.js";

const serviceTypeInclude = {
  segmento_venda: { select: { id: true, nome: true } },
  _count: { select: { servicos_vendedor: true } },
};

function parsePositiveId(value, message = "ID invalido") {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(message, 400);
  return id;
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureUniqueName(name, ignoredId = null) {
  const slug = slugify(name);
  const existing = await prisma.tipoServico.findFirst({
    select: { id: true },
    where: {
      OR: [{ nome: { equals: name, mode: "insensitive" } }, { slug }],
      excluido_em: null,
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
    },
  });
  if (existing) throw new AppError("Ja existe um servico com este nome", 409);
  return slug;
}

async function ensureSegment(segmentId) {
  const id = parsePositiveId(segmentId, "Segmento invalido");
  const segment = await prisma.segmentoVenda.findFirst({
    select: { id: true },
    where: { excluido_em: null, id, status: "ATIVO" },
  });
  if (!segment) throw new AppError("Selecione um segmento comercial ativo", 409);
  return id;
}

export async function listAdminServiceTypes(query = {}) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const types = await prisma.tipoServico.findMany({
    include: serviceTypeInclude,
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    where: {
      excluido_em: null,
      ...(search ? { nome: { contains: search, mode: "insensitive" } } : {}),
      ...(["ATIVO", "INATIVO", "PAUSADO"].includes(status) ? { status } : {}),
    },
  });
  return { serviceTypes: types.map(serializeAdminServiceType) };
}

export async function createAdminServiceType(data) {
  const [slug, segmentId] = await Promise.all([
    ensureUniqueName(data.name),
    ensureSegment(data.segmentId),
  ]);
  const type = await prisma.tipoServico.create({
    data: {
      descricao: data.description || null,
      icone: data.iconName || null,
      modo_atendimento: data.mode,
      nome: data.name,
      ordem: data.sortOrder,
      tipo_operacao: data.operationalType,
      segmento_venda_id: segmentId,
      slug,
      status: data.status,
    },
    include: serviceTypeInclude,
  });
  return { serviceType: serializeAdminServiceType(type) };
}

export async function updateAdminServiceType(serviceTypeId, data) {
  const id = parsePositiveId(serviceTypeId, "Servico invalido");
  const existing = await prisma.tipoServico.findFirst({ select: { id: true }, where: { excluido_em: null, id } });
  if (!existing) throw new AppError("Servico nao encontrado", 404);
  const [slug, segmentId] = await Promise.all([
    data.name ? ensureUniqueName(data.name, id) : undefined,
    data.segmentId !== undefined ? ensureSegment(data.segmentId) : undefined,
  ]);
  const type = await prisma.tipoServico.update({
    data: {
      ...(data.description !== undefined ? { descricao: data.description || null } : {}),
      ...(data.iconName !== undefined ? { icone: data.iconName || null } : {}),
      ...(data.mode ? { modo_atendimento: data.mode } : {}),
      ...(data.name ? { nome: data.name, slug } : {}),
      ...(data.operationalType ? { tipo_operacao: data.operationalType } : {}),
      ...(data.sortOrder !== undefined ? { ordem: data.sortOrder } : {}),
      ...(segmentId !== undefined ? { segmento_venda_id: segmentId } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
    include: serviceTypeInclude,
    where: { id },
  });
  return { serviceType: serializeAdminServiceType(type) };
}

export async function deleteAdminServiceType(serviceTypeId) {
  const id = parsePositiveId(serviceTypeId, "Servico invalido");
  const existing = await prisma.tipoServico.findFirst({ select: { id: true }, where: { excluido_em: null, id } });
  if (!existing) throw new AppError("Servico nao encontrado", 404);
  await prisma.tipoServico.update({ data: { excluido_em: new Date(), status: "INATIVO" }, where: { id } });
}
