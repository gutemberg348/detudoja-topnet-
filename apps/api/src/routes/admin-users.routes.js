import { Router } from "express";
import {
  adjustAdminUserWalletController,
  addAdminUserServiceController,
  getAdminUserController,
  listAdminUsersController,
  creditAdminUserWalletController,
  updateAdminUserController,
  updateAdminCourierProfileController,
  updateAdminSellerProfileController,
  updateAdminUserServiceController,
  updateAdminUserStatusController,
} from "../modules/admin/admin-users.controller.js";
import {
  adjustAdminUserWalletSchema,
  creditAdminUserWalletSchema,
  createAdminUserServiceSchema,
  updateAdminUserSchema,
  updateAdminCourierProfileSchema,
  updateAdminSellerProfileSchema,
  updateAdminUserServiceSchema,
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
  "/:userId/wallet-adjustment",
  roleMiddleware("super_admin", "financeiro"),
  validate(adjustAdminUserWalletSchema),
  adjustAdminUserWalletController,
);
adminUsersRoutes.post(
  "/:userId/wallet-credit",
  roleMiddleware("super_admin", "financeiro"),
  validate(creditAdminUserWalletSchema),
  creditAdminUserWalletController,
);
adminUsersRoutes.patch(
  "/:userId/seller-profile",
  roleMiddleware("super_admin", "admin", "operacoes"),
  validate(updateAdminSellerProfileSchema),
  updateAdminSellerProfileController,
);
adminUsersRoutes.patch(
  "/:userId/courier-profile",
  roleMiddleware("super_admin", "admin", "operacoes"),
  validate(updateAdminCourierProfileSchema),
  updateAdminCourierProfileController,
);
adminUsersRoutes.post(
  "/:userId/seller-services",
  roleMiddleware("super_admin", "admin", "operacoes"),
  validate(createAdminUserServiceSchema),
  addAdminUserServiceController,
);
adminUsersRoutes.patch(
  "/:userId/seller-services/:sellerServiceId",
  roleMiddleware("super_admin", "admin", "operacoes"),
  validate(updateAdminUserServiceSchema),
  updateAdminUserServiceController,
);
adminUsersRoutes.patch(
  "/:userId/status",
  roleMiddleware("super_admin", "admin", "compliance", "kyc"),
  validate(updateAdminUserStatusSchema),
  updateAdminUserStatusController,
);
