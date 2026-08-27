import { Router } from "express";
import {
  getAdminEarningsSettingsController,
  getAdminSupportSettingsController,
  updateAdminCategoryFeeController,
  updateAdminOrderEarningsDistributionController,
  updateAdminSegmentFeeController,
  updateAdminSupportSettingsController,
} from "../modules/admin/admin-settings.controller.js";
import {
  updateAdminCategoryFeeSchema,
  updateAdminOrderEarningsDistributionSchema,
  updateAdminSegmentFeeSchema,
  updateAdminSupportSettingsSchema,
} from "../modules/admin/admin.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";

export const adminSettingsRoutes = Router();

adminSettingsRoutes.get(
  "/support",
  roleMiddleware("super_admin", "admin", "suporte"),
  getAdminSupportSettingsController,
);
adminSettingsRoutes.patch(
  "/support",
  roleMiddleware("super_admin", "admin", "suporte"),
  validate(updateAdminSupportSettingsSchema),
  updateAdminSupportSettingsController,
);
adminSettingsRoutes.get(
  "/earnings",
  roleMiddleware("super_admin", "admin", "financeiro"),
  getAdminEarningsSettingsController,
);
adminSettingsRoutes.patch(
  "/earnings/distribution",
  roleMiddleware("super_admin", "financeiro"),
  validate(updateAdminOrderEarningsDistributionSchema),
  updateAdminOrderEarningsDistributionController,
);
adminSettingsRoutes.patch(
  "/earnings/categories/:categoryId",
  roleMiddleware("super_admin", "financeiro"),
  validate(updateAdminCategoryFeeSchema),
  updateAdminCategoryFeeController,
);
adminSettingsRoutes.patch(
  "/earnings/segments/:segmentId",
  roleMiddleware("super_admin", "financeiro"),
  validate(updateAdminSegmentFeeSchema),
  updateAdminSegmentFeeController,
);
