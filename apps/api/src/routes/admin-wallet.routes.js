import { Router } from "express";
import {
  getAdminWalletOverviewController,
  updateAdminWalletTypeController,
} from "../modules/admin/admin-wallet.controller.js";
import { updateAdminWalletTypeSchema } from "../modules/admin/admin.validator.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminWalletRoutes = Router();

adminWalletRoutes.get("/", getAdminWalletOverviewController);
adminWalletRoutes.patch(
  "/types/:typeId",
  roleMiddleware("super_admin", "financeiro"),
  validate(updateAdminWalletTypeSchema),
  updateAdminWalletTypeController,
);
