import { AppError } from "../../utils/errors.js";
import { parsePositiveId } from "../../utils/ids.js";
import {
  deleteUploadedImage,
  saveUploadedImage,
} from "../uploads/image.service.js";
import { serializeCategory } from "./admin.serializer.js";
import { adminCategoriesRepository } from "./admin-categories.repository.js";

async function ensureUniqueCategoryName(name, ignoredId) {
  const category = await adminCategoriesRepository.findNameConflict(name, ignoredId);

  if (category) {
    throw new AppError("Ja existe uma categoria com este nome", 409);
  }
}

export async function listAdminCategories(query = {}) {
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "").toUpperCase();
  const categories = await adminCategoriesRepository.list({ search, status });

  return { categories: categories.map(serializeCategory) };
}

export async function createAdminCategory(data, iconFile = null) {
  await ensureUniqueCategoryName(data.name);
  let category = null;
  let iconUpload = null;

  try {
    category = await adminCategoriesRepository.create({
      descricao: data.description || null,
      icone_url: data.iconUrl ?? null,
      nome: data.name,
      status: data.status,
    });

    if (iconFile) {
      iconUpload = await saveUploadedImage(iconFile, {
        folder: ["categorias", String(category.id)],
        profile: "categoryIcon",
      });

      category = await adminCategoriesRepository.update(category.id, {
        icone_url: iconUpload.url,
      });
    }

    return { category: serializeCategory(category) };
  } catch (error) {
    if (iconUpload) {
      await deleteUploadedImage(iconUpload.url);
    }

    if (category) {
      await adminCategoriesRepository
        .softDelete(category.id)
        .catch(() => {});
    }

    throw error;
  }
}

export async function updateAdminCategory(categoryId, data, iconFile = null) {
  const parsedCategoryId = parsePositiveId(categoryId, "Categoria invalida");
  const existing = await adminCategoriesRepository.findActiveById(parsedCategoryId);

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

    const category = await adminCategoriesRepository.update(parsedCategoryId, {
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
  const parsedCategoryId = parsePositiveId(categoryId, "Categoria invalida");
  const existing = await adminCategoriesRepository.findActiveById(parsedCategoryId);

  if (!existing) {
    throw new AppError("Categoria nao encontrada", 404);
  }

  await adminCategoriesRepository.softDelete(parsedCategoryId);

  await deleteUploadedImage(existing.icone_url);
}
