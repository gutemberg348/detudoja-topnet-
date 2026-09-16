import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { serializeAdminServiceType } from "./admin.serializer.js";
import { adminServiceTypesRepository } from "./admin-service-types.repository.js";

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
  const existing = await adminServiceTypesRepository.findNameConflict(
    name,
    slug,
    ignoredId,
  );
  if (existing) throw new AppError("Ja existe um servico com este nome", 409);
  return slug;
}

async function ensureSegment(segmentId) {
  const id = parsePositiveId(segmentId, "Segmento invalido");
  const segment = await adminServiceTypesRepository.findActiveSegment(id);
  if (!segment) throw new AppError("Selecione um segmento comercial ativo", 409);
  return id;
}

export async function listAdminServiceTypes(query = {}) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const types = await adminServiceTypesRepository.list({ search, status });
  return { serviceTypes: types.map(serializeAdminServiceType) };
}

export async function createAdminServiceType(data) {
  const [slug, segmentId] = await Promise.all([
    ensureUniqueName(data.name),
    ensureSegment(data.segmentId),
  ]);
  const type = await adminServiceTypesRepository.create({
    descricao: data.description || null,
    icone: data.iconName || null,
    modo_atendimento: data.mode,
    nome: data.name,
    ordem: data.sortOrder,
    requisitos_cadastro: data.registrationRequirements,
    tipo_operacao: data.operationalType,
    segmento_venda_id: segmentId,
    slug,
    status: data.status,
  });
  return { serviceType: serializeAdminServiceType(type) };
}

export async function updateAdminServiceType(serviceTypeId, data) {
  const id = parsePositiveId(serviceTypeId, "Servico invalido");
  const existing = await adminServiceTypesRepository.findById(id);
  if (!existing) throw new AppError("Servico nao encontrado", 404);
  const [slug, segmentId] = await Promise.all([
    data.name ? ensureUniqueName(data.name, id) : undefined,
    data.segmentId !== undefined ? ensureSegment(data.segmentId) : undefined,
  ]);
  const type = await adminServiceTypesRepository.update(id, {
    ...(data.description !== undefined ? { descricao: data.description || null } : {}),
    ...(data.iconName !== undefined ? { icone: data.iconName || null } : {}),
    ...(data.mode ? { modo_atendimento: data.mode } : {}),
    ...(data.name ? { nome: data.name, slug } : {}),
    ...(data.operationalType ? { tipo_operacao: data.operationalType } : {}),
    ...(data.registrationRequirements !== undefined
      ? { requisitos_cadastro: data.registrationRequirements }
      : {}),
    ...(data.sortOrder !== undefined ? { ordem: data.sortOrder } : {}),
    ...(segmentId !== undefined ? { segmento_venda_id: segmentId } : {}),
    ...(data.status ? { status: data.status } : {}),
  });
  return { serviceType: serializeAdminServiceType(type) };
}

export async function deleteAdminServiceType(serviceTypeId) {
  const id = parsePositiveId(serviceTypeId, "Servico invalido");
  const existing = await adminServiceTypesRepository.findById(id);
  if (!existing) throw new AppError("Servico nao encontrado", 404);
  await adminServiceTypesRepository.softDelete(id);
}
