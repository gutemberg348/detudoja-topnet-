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

export const adminUsersRoutes = Router();

adminUsersRoutes.get("/", listAdminUsersController);
adminUsersRoutes.get("/:userId", getAdminUserController);
adminUsersRoutes.patch(
  "/:userId",
  validate(updateAdminUserSchema),
  updateAdminUserController,
);
adminUsersRoutes.post(
  "/:userId/wallet-credit",
  validate(creditAdminUserWalletSchema),
  creditAdminUserWalletController,
);
adminUsersRoutes.patch(
  "/:userId/status",
  validate(updateAdminUserStatusSchema),
  updateAdminUserStatusController,
);
