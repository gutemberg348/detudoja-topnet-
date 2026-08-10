import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import { getPagination } from "../../utils/pagination.js";
import { serializeAdminStore } from "./admin.serializer.js";

const storeInclude = {
  _count: {
    select: {
      pedidos: true,
      produtos: { where: { excluido_em: null } },
    },
  },
  categoria: {
    include: { segmento_venda: true },
  },
  segmento_venda: true,
  lojista: {
    include: {
      usuario: {
        select: {
          email: true,
          id: true,
          nome: true,
          status: true,
          telefone: true,
        },
      },
    },
  },
};

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
  const category = await prisma.categoriaLoja.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: categoryId },
  });

  if (!category) {
    throw new AppError("Categoria nao encontrada", 404);
  }
}

async function getStoreSegment(segmentId, categoryId) {
  const segment = await prisma.segmentoVenda.findFirst({
    include: {
      categoria_loja: true,
      categorias_loja: {
        where: { excluido_em: null, status: "ATIVA" },
      },
    },
    where: { excluido_em: null, id: segmentId, status: "ATIVO" },
  });
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
    const user = await prisma.usuario.findFirst({
      select: { id: true },
      where: {
        email,
        id: { not: userId },
      },
    });

    if (user) {
      throw new AppError("Ja existe usuario com este e-mail", 409);
    }
  }

  if (phone) {
    const user = await prisma.usuario.findFirst({
      select: { id: true },
      where: {
        id: { not: userId },
        telefone: phone,
      },
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
    prisma.loja.findMany({
      include: storeInclude,
      orderBy: { criado_em: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      where,
    }),
    prisma.loja.count({ where }),
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
  const store = await prisma.loja.findFirst({
    include: storeInclude,
    where: { excluido_em: null, id: parsedStoreId },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada", 404);
  }

  return { store: serializeAdminStore(store) };
}

export async function updateAdminStore(adminId, storeId, data) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const currentStore = await prisma.loja.findFirst({
    include: { lojista: true },
    where: { excluido_em: null, id: parsedStoreId },
  });

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

  const result = await prisma.$transaction(async (database) => {
    if (shouldUpdateOwner) {
      await database.usuario.update({
        data: {
          ...(data.ownerEmail ? { email: data.ownerEmail } : {}),
          ...(data.ownerName ? { nome: data.ownerName } : {}),
          ...(data.ownerPhone !== undefined ? { telefone: ownerPhone || null } : {}),
        },
        where: { id: currentStore.lojista.usuario_id },
      });
    }

    if (
      data.merchantStatus !== undefined ||
      data.merchantKycStatus !== undefined ||
      data.merchantMonthlySalesLimitCents !== undefined
    ) {
      await database.lojista.update({
        data: {
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
        },
        where: { id: currentStore.lojista_id },
      });
    }

    return database.loja.update({
      data: {
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
      },
      include: storeInclude,
      where: { id: parsedStoreId },
    });
  });

  return { store: serializeAdminStore(result) };
}

export async function deleteAdminStore(storeId) {
  const parsedStoreId = parsePositiveId(storeId, "Loja invalida");
  const store = await prisma.loja.findFirst({
    select: { id: true },
    where: { excluido_em: null, id: parsedStoreId },
  });

  if (!store) {
    throw new AppError("Loja nao encontrada", 404);
  }

  await prisma.loja.update({
    data: {
      excluido_em: new Date(),
      status: "PAUSADA",
      visivel_no_app: false,
    },
    where: { id: parsedStoreId },
  });

  return { deleted: true, storeId: parsedStoreId };
}
