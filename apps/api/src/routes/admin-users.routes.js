import { Router } from "express";
import {
  getAdminUserController,
  listAdminUsersController,
  creditAdminUserWalletController,
  updateAdminUserController,
  updateAdminUserStatusController,
} from "../modules/admin/admin-users.controller.js";
import {
  creditAdminUserWalletSchema,
  updateAdminUserSchema,
  updateAdminUserStatusSchema,
} from "../modules/admin/admin.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";

export const adminUsersRoutes = Router();

adminUsersRoutes.get("/", listAdminUsersController);
adminUsersRoutes.get("/:userId", getAdminUserController);
adminUsersRoutes.patch(
  "/:userId",
  roleMiddleware("super_admin", "admin", "operacoes"),
  validate(updateAdminUserSchema),
  updateAdminUserController,
);
adminUsersRoutes.post(
  "/:userId/wallet-credit",
  roleMiddleware("super_admin", "financeiro"),
  validate(creditAdminUserWalletSchema),
  creditAdminUserWalletController,
);
adminUsersRoutes.patch(
  "/:userId/status",
  roleMiddleware("super_admin", "admin", "compliance", "kyc"),
  validate(updateAdminUserStatusSchema),
  updateAdminUserStatusController,
);
