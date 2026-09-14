import { Router } from "express";
import {
  activateAllAdminUserServicesController,
  adjustAdminUserWalletController,
  addAdminUserServiceController,
  approveAdminUserKycWithoutSubmissionController,
  getAdminUserController,
  listAdminUsersController,
  creditAdminUserWalletController,
  updateAdminUserController,
  updateAdminUserPasswordController,
  updateAdminPayoutAccountController,
  updateAdminCourierProfileController,
  updateAdminSellerProfileController,
  updateAdminUserServiceController,
  updateAdminUserStatusController,
} from "../modules/admin/admin-users.controller.js";
import {
  approveAdminUserKycSchema,
  adjustAdminUserWalletSchema,
  creditAdminUserWalletSchema,
  createAdminUserServiceSchema,
  updateAdminUserSchema,
  updateAdminCourierProfileSchema,
  updateAdminSellerProfileSchema,
  updateAdminUserServiceSchema,
  updateAdminUserStatusSchema,
  updateAdminUserPasswordSchema,
  updateAdminPayoutAccountSchema,
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
  "/:userId/kyc/approve-without-documents",
  roleMiddleware("super_admin", "admin", "compliance", "kyc"),
  validate(approveAdminUserKycSchema),
  approveAdminUserKycWithoutSubmissionController,
);
adminUsersRoutes.patch(
  "/:userId/password",
  roleMiddleware("super_admin", "admin"),
  validate(updateAdminUserPasswordSchema),
  updateAdminUserPasswordController,
);
adminUsersRoutes.patch(
  "/:userId/payout-account",
  roleMiddleware("super_admin", "admin", "financeiro"),
  validate(updateAdminPayoutAccountSchema),
  updateAdminPayoutAccountController,
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
adminUsersRoutes.post(
  "/:userId/seller-services/activate-all",
  roleMiddleware("super_admin", "admin", "operacoes"),
  activateAllAdminUserServicesController,
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
