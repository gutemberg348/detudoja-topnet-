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

export const adminSettingsRoutes = Router();

adminSettingsRoutes.get("/support", getAdminSupportSettingsController);
adminSettingsRoutes.patch(
  "/support",
  validate(updateAdminSupportSettingsSchema),
  updateAdminSupportSettingsController,
);
adminSettingsRoutes.get("/earnings", getAdminEarningsSettingsController);
adminSettingsRoutes.patch(
  "/earnings/distribution",
  validate(updateAdminOrderEarningsDistributionSchema),
  updateAdminOrderEarningsDistributionController,
);
adminSettingsRoutes.patch(
  "/earnings/categories/:categoryId",
  validate(updateAdminCategoryFeeSchema),
  updateAdminCategoryFeeController,
);
adminSettingsRoutes.patch(
  "/earnings/segments/:segmentId",
  validate(updateAdminSegmentFeeSchema),
  updateAdminSegmentFeeController,
);
