import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";
import {
  deleteUploadedImage,
  saveUploadedImage,
} from "../uploads/image.service.js";
import { serializeCategory } from "./admin.serializer.js";

const categoryInclude = {
  _count: { select: { lojas: true, segmentos_venda: true } },
};

function parsePositiveIntId(value, label = "ID invalido") {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(label, 400);
  }

  return id;
}

async function ensureUniqueCategoryName(name, ignoredId) {
  const category = await prisma.categoriaLoja.findFirst({
    select: { id: true },
    where: {
      excluido_em: null,
      nome: { equals: name, mode: "insensitive" },
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
    },
  });

  if (category) {
    throw new AppError("Ja existe uma categoria com este nome", 409);
  }
}

export async function listAdminCategories(query = {}) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const categories = await prisma.categoriaLoja.findMany({
    include: categoryInclude,
    orderBy: { nome: "asc" },
    where: {
      excluido_em: null,
      ...(search
        ? { nome: { contains: search, mode: "insensitive" } }
        : {}),
      ...(["ATIVA", "INATIVA"].includes(status) ? { status } : {}),
    },
  });

  return { categories: categories.map(serializeCategory) };
}

export async function createAdminCategory(data, iconFile = null) {
  await ensureUniqueCategoryName(data.name);
  let category = null;
  let iconUpload = null;

  try {
    category = await prisma.categoriaLoja.create({
      data: {
        descricao: data.description || null,
        icone_url: data.iconUrl ?? null,
        nome: data.name,
        status: data.status,
      },
      include: categoryInclude,
    });

    if (iconFile) {
      iconUpload = await saveUploadedImage(iconFile, {
        folder: ["categorias", String(category.id)],
        profile: "categoryIcon",
      });

      category = await prisma.categoriaLoja.update({
        data: { icone_url: iconUpload.url },
        include: categoryInclude,
        where: { id: category.id },
      });
    }

    return { category: serializeCategory(category) };
  } catch (error) {
    if (iconUpload) {
      await deleteUploadedImage(iconUpload.url);
    }

    if (category) {
      await prisma.categoriaLoja
        .update({
          data: { excluido_em: new Date(), status: "INATIVA" },
          where: { id: category.id },
        })
        .catch(() => {});
    }

    throw error;
  }
}

export async function updateAdminCategory(categoryId, data, iconFile = null) {
  const parsedCategoryId = parsePositiveIntId(categoryId, "Categoria invalida");
  const existing = await prisma.categoriaLoja.findFirst({
    select: { icone_url: true, id: true },
    where: { excluido_em: null, id: parsedCategoryId },
  });

  if (!existing) {
    throw new AppError("Categoria nao encontrada", 404);
  }

  if (data.name) {
    await ensureUniqueCategoryName(data.name, parsedCategoryId);
  }

  let iconUpload = null;

  try {
    if (iconFile) {
      iconUpload = await saveUploadedImage(iconFile, {
        folder: ["categorias", String(parsedCategoryId)],
        profile: "categoryIcon",
      });
    }

    const category = await prisma.categoriaLoja.update({
      data: {
        ...(data.description !== undefined
          ? { descricao: data.description || null }
          : {}),
        ...(iconUpload
          ? { icone_url: iconUpload.url }
          : data.iconUrl !== undefined
            ? { icone_url: data.iconUrl || null }
            : {}),
        ...(data.name ? { nome: data.name } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
      include: categoryInclude,
      where: { id: parsedCategoryId },
    });

    if (iconUpload) {
      await deleteUploadedImage(existing.icone_url);
    }

    return { category: serializeCategory(category) };
  } catch (error) {
    if (iconUpload) {
      await deleteUploadedImage(iconUpload.url);
    }

    throw error;
  }
}

export async function deleteAdminCategory(categoryId) {
  const parsedCategoryId = parsePositiveIntId(categoryId, "Categoria invalida");
  const existing = await prisma.categoriaLoja.findFirst({
    select: { icone_url: true, id: true },
    where: { excluido_em: null, id: parsedCategoryId },
  });

  if (!existing) {
    throw new AppError("Categoria nao encontrada", 404);
  }

  await prisma.categoriaLoja.update({
    data: { excluido_em: new Date(), status: "INATIVA" },
    where: { id: parsedCategoryId },
  });

  await deleteUploadedImage(existing.icone_url);
}
