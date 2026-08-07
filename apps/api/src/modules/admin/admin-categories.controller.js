import {
  createAdminCategory,
  deleteAdminCategory,
  listAdminCategories,
  updateAdminCategory,
} from "./admin-categories.service.js";

export async function listAdminCategoriesController(req, res, next) {
  try {
    res.json(await listAdminCategories(req.query));
  } catch (error) {
    next(error);
  }
}

export async function createAdminCategoryController(req, res, next) {
  try {
    res.status(201).json(await createAdminCategory(req.body, req.file ?? null));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminCategoryController(req, res, next) {
  try {
    res.json(
      await updateAdminCategory(
        req.params.categoryId,
        req.body,
        req.file ?? null,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminCategoryController(req, res, next) {
  try {
    await deleteAdminCategory(req.params.categoryId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
