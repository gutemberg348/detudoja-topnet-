import { Router } from "express";
import {
  createAdminCategoryController,
  deleteAdminCategoryController,
  listAdminCategoriesController,
  updateAdminCategoryController,
} from "../modules/admin/admin-categories.controller.js";
import {
  createAdminCategorySchema,
  updateAdminCategorySchema,
} from "../modules/admin/admin.validator.js";
import {
  handleUpload,
  uploadAdminCategoryIcon,
} from "../modules/uploads/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminCategoriesRoutes = Router();

adminCategoriesRoutes.get("/", listAdminCategoriesController);
adminCategoriesRoutes.post(
  "/",
  handleUpload(uploadAdminCategoryIcon),
  validate(createAdminCategorySchema),
  createAdminCategoryController,
);
adminCategoriesRoutes.patch(
  "/:categoryId",
  handleUpload(uploadAdminCategoryIcon),
  validate(updateAdminCategorySchema),
  updateAdminCategoryController,
);
adminCategoriesRoutes.delete("/:categoryId", deleteAdminCategoryController);
