import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { getPagination } from "../../utils/pagination.js";
import { serializeAdminStore } from "./admin.serializer.js";
import { adminStoresRepository } from "./admin-stores.repository.js";

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function buildStoreWhere(query = {}) {
  const search = String(query.search ?? "").trim();
  const searchDigits = onlyDigits(search);
  const status = String(query.status ?? "").toUpperCase();
  const categoryId = Number(query.categoryId);
  const visibility = String(query.visibility ?? "").toLowerCase();

  return {
    excluido_em: null,
    ...(Number.isInteger(categoryId) && categoryId > 0
      ? { categoria_id: categoryId }
      : {}),
    ...(["ATIVA", "PAUSADA", "BLOQUEADA", "RASCUNHO", "EM_ANALISE", "REPROVADA"].includes(status)
      ? { status }
      : {}),
    ...(visibility === "visible"
      ? { visivel_no_app: true }
      : visibility === "hidden"
        ? { visivel_no_app: false }
        : {}),
    ...(search
      ? {
          OR: [
            { nome: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            ...(searchDigits
              ? [
                  { telefone: { contains: searchDigits } },
                  { whatsapp: { contains: searchDigits } },
                ]
              : []),
            { lojista: { usuario: { nome: { contains: search, mode: "insensitive" } } } },
            { lojista: { usuario: { email: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

async function ensureCategoryExists(categoryId) {
  const category = await adminStoresRepository.findCategory(categoryId);

  if (!category) {
    throw new AppError("Categoria nao encontrada", 404);
  }
}

async function getStoreSegment(segmentId, categoryId) {
  const segment = await adminStoresRepository.findSegment(segmentId);
  const category = segment?.categoria_loja
    ?? segment?.categorias_loja.find((item) => item.id === categoryId)
    ?? null;

  if (!segment || !category || (categoryId && category.id !== categoryId)) {
    throw new AppError("Segmento nao pertence a categoria selecionada", 400);
  }

  return { category, segment };
}

async function ensureUniqueOwnerContact({ email, phone, userId }) {
  if (email) {
    const user = await adminStoresRepository.findUserContactConflict({
      email,
      userId,
    });

    if (user) {
      throw new AppError("Ja existe usuario com este e-mail", 409);
    }
  }

  if (phone) {
    const user = await adminStoresRepository.findUserContactConflict({
      phone,
      userId,
    });

    if (user) {
      throw new AppError("Ja existe usuario com este telefone", 409);
    }
  }
}

export async function listAdminStores(query = {}) {
  const { page, perPage } = getPagination(query);
  const where = buildStoreWhere(query);
  const [stores, total] = await Promise.all([
    adminStoresRepository.list({ page, perPage, where }),
    adminStoresRepository.count(where),
  ]);

  return {
    pagination: {
      page,
      pages: Math.max(Math.ceil(total / perPage), 1),
      perPage,
      total,
    },
    stores: stores.map(serializeAdminStore),
  };
}

export async function getAdminStore(storeId) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const store = await adminStoresRepository.findStore(parsedStoreId);

  if (!store) {
    throw new AppError("Loja nao encontrada", 404);
  }

  return { store: serializeAdminStore(store) };
}

export async function updateAdminStore(adminId, storeId, data) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const currentStore = await adminStoresRepository.findCurrentStore(parsedStoreId);

  if (!currentStore) {
    throw new AppError("Loja nao encontrada", 404);
  }

  let commercialClassification = null;

  if (data.segmentId) {
    commercialClassification = await getStoreSegment(data.segmentId, data.categoryId);
  } else if (data.categoryId) {
    await ensureCategoryExists(data.categoryId);
  }

  const ownerPhone =
    data.ownerPhone !== undefined ? onlyDigits(data.ownerPhone) : undefined;
  const shouldUpdateOwner =
    data.ownerEmail !== undefined ||
    data.ownerName !== undefined ||
    data.ownerPhone !== undefined;

  if (shouldUpdateOwner) {
    await ensureUniqueOwnerContact({
      email: data.ownerEmail,
      phone: ownerPhone,
      userId: currentStore.lojista.usuario_id,
    });
  }

  const result = await adminStoresRepository.transaction(async (repository) => {
    if (shouldUpdateOwner) {
      await repository.updateOwner(currentStore.lojista.usuario_id, {
        ...(data.ownerEmail ? { email: data.ownerEmail } : {}),
        ...(data.ownerName ? { nome: data.ownerName } : {}),
        ...(data.ownerPhone !== undefined ? { telefone: ownerPhone || null } : {}),
      });
    }

    if (
      data.merchantStatus !== undefined ||
      data.merchantKycStatus !== undefined ||
      data.merchantMonthlySalesLimitCents !== undefined
    ) {
      await repository.updateMerchant(currentStore.lojista_id, {
        ...(data.merchantKycStatus ? { status_kyc: data.merchantKycStatus } : {}),
        ...(data.merchantMonthlySalesLimitCents !== undefined
          ? {
              limite_faturamento_mensal_centavos:
                data.merchantMonthlySalesLimitCents == null
                  ? null
                  : BigInt(data.merchantMonthlySalesLimitCents),
            }
          : {}),
        ...(data.merchantStatus ? { status: data.merchantStatus } : {}),
      });
    }

    return repository.updateStore(parsedStoreId, {
        ...(data.acceptsOnlinePayment !== undefined
          ? { aceita_pagamento_online: data.acceptsOnlinePayment }
          : {}),
        ...(data.acceptsQrCode !== undefined
          ? { aceita_qrcode: data.acceptsQrCode }
          : {}),
        ...(commercialClassification
          ? {
              categoria_id: commercialClassification.category.id,
              segmento_venda_id: commercialClassification.segment.id,
            }
          : data.categoryId
            ? { categoria_id: data.categoryId }
            : {}),
        ...(data.description !== undefined ? { descricao: data.description || null } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.name ? { nome: data.name } : {}),
        ...(data.phone !== undefined ? { telefone: onlyDigits(data.phone) || null } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.visibleInApp !== undefined ? { visivel_no_app: data.visibleInApp } : {}),
        ...(data.whatsapp !== undefined ? { whatsapp: onlyDigits(data.whatsapp) || null } : {}),
        ...(data.customFeePercent !== undefined
          ? {
              taxa_plataforma_alterada_em:
                data.customFeePercent == null ? null : new Date(),
              taxa_plataforma_alterada_por_admin_id:
                data.customFeePercent == null ? null : adminId,
              taxa_plataforma_personalizada_percentual: data.customFeePercent,
            }
          : {}),
    });
  });

  return { store: serializeAdminStore(result) };
}

export async function deleteAdminStore(storeId) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const store = await adminStoresRepository.findStoreId(parsedStoreId);

  if (!store) {
    throw new AppError("Loja nao encontrada", 404);
  }

  await adminStoresRepository.softDelete(parsedStoreId);

  return { deleted: true, storeId: parsedStoreId };
}
