import { Router } from "express";
import {
  createAutonomousSaleController,
  createStoreOrderMessageController,
  createStoreOrderProposalController,
  createStoreProductController,
  createSellerOnboardingController,
  createSellerStoreController,
  deleteSellerStoreController,
  deleteStoreProductController,
  getSellerProfileController,
  listStoreOrderMessagesController,
  listSellerStoreCategoriesController,
  listSellerSegmentsController,
  updateSellerStoreController,
  updateSellerStoreMediaController,
  updateStoreOrderStatusController,
  updateStoreProductController,
} from "../modules/seller/seller.controller.js";
import {
  createStoreQrChargeController,
  getGeneratedChargeQrController,
  listGeneratedChargesController,
  listGeneratedChargesHistoryController,
  listStoreGeneratedChargesController,
} from "../modules/charges/charge.controller.js";
import { createStoreSignupQrController } from "../modules/auth/store-signup.controller.js";
import { createStoreChargeSchema } from "../modules/charges/charge.validator.js";
import {
  createAutonomousSaleSchema,
  createStoreProductSchema,
  createSellerStoreSchema,
  sellerOnboardingSchema,
  updateSellerStoreSchema,
  updateSellerStoreMediaSchema,
  updateStoreOrderStatusSchema,
  updateStoreProductSchema,
} from "../modules/seller/seller.validator.js";
import {
  createOrderMessageSchema,
  createStoreOrderProposalSchema,
} from "../modules/orders/orders.validator.js";
import {
  handleUpload,
  uploadChatAttachment,
  uploadStoreMedia,
  uploadStoreProductImage,
} from "../modules/uploads/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  getPayoutAccountController,
  savePayoutAccountController,
} from "../modules/payouts/payout.controller.js";
import { payoutAccountSchema } from "../modules/payouts/payout.validator.js";
import {
  payoutPixKeyValidationRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import {
  acceptStoreStaffInviteController,
  createStoreStaffInviteController,
  declineStoreStaffInviteController,
  getMyStoreWorkplacesController,
  getStoreTeamController,
  revokeStoreMemberController,
} from "../modules/store-staff/store-staff.controller.js";
import {
  createStoreStaffInviteSchema,
  decideStoreStaffInviteSchema,
} from "../modules/store-staff/store-staff.validator.js";

export const sellerRoutes = Router();

sellerRoutes.get("/segments", listSellerSegmentsController);
sellerRoutes.get("/store-categories", listSellerStoreCategoriesController);
sellerRoutes.get("/profile", getSellerProfileController);
sellerRoutes.get("/workplaces", getMyStoreWorkplacesController);
sellerRoutes.post(
  "/workplaces/invitations/accept",
  validate(decideStoreStaffInviteSchema),
  acceptStoreStaffInviteController,
);
sellerRoutes.post(
  "/workplaces/invitations/:invitationId/decline",
  declineStoreStaffInviteController,
);
sellerRoutes.get("/payout-account", getPayoutAccountController);
sellerRoutes.put(
  "/payout-account",
  payoutPixKeyValidationRateLimit,
  validate(payoutAccountSchema),
  savePayoutAccountController,
);
sellerRoutes.get("/charges", listGeneratedChargesController);
sellerRoutes.get("/charges/history", listGeneratedChargesHistoryController);
sellerRoutes.get("/charges/:chargeId/qr", getGeneratedChargeQrController);
sellerRoutes.post(
  "/onboarding",
  validate(sellerOnboardingSchema),
  createSellerOnboardingController,
);
sellerRoutes.post(
  "/stores",
  validate(createSellerStoreSchema),
  createSellerStoreController,
);
sellerRoutes.patch(
  "/stores/:storeId",
  validate(updateSellerStoreSchema),
  updateSellerStoreController,
);
sellerRoutes.delete("/stores/:storeId", deleteSellerStoreController);
sellerRoutes.get("/stores/:storeId/team", getStoreTeamController);
sellerRoutes.post(
  "/stores/:storeId/team/invitations",
  validate(createStoreStaffInviteSchema),
  createStoreStaffInviteController,
);
sellerRoutes.delete(
  "/stores/:storeId/team/members/:memberId",
  revokeStoreMemberController,
);
sellerRoutes.post(
  "/stores/:storeId/charges",
  validate(createStoreChargeSchema),
  createStoreQrChargeController,
);
sellerRoutes.get("/stores/:storeId/charges", listStoreGeneratedChargesController);
sellerRoutes.get("/stores/:storeId/signup-qr", createStoreSignupQrController);
sellerRoutes.patch(
  "/stores/:storeId/media",
  handleUpload(uploadStoreMedia),
  validate(updateSellerStoreMediaSchema),
  updateSellerStoreMediaController,
);
sellerRoutes.post(
  "/stores/:storeId/products",
  handleUpload(uploadStoreProductImage),
  validate(createStoreProductSchema),
  createStoreProductController,
);
sellerRoutes.patch(
  "/stores/:storeId/products/:productId",
  handleUpload(uploadStoreProductImage),
  validate(updateStoreProductSchema),
  updateStoreProductController,
);
sellerRoutes.delete(
  "/stores/:storeId/products/:productId",
  deleteStoreProductController,
);
sellerRoutes.patch(
  "/stores/:storeId/orders/:orderId/status",
  validate(updateStoreOrderStatusSchema),
  updateStoreOrderStatusController,
);
sellerRoutes.get(
  "/stores/:storeId/orders/:orderId/messages",
  listStoreOrderMessagesController,
);
sellerRoutes.post(
  "/stores/:storeId/orders/:orderId/messages",
  handleUpload(uploadChatAttachment),
  validate(createOrderMessageSchema),
  createStoreOrderMessageController,
);
sellerRoutes.post(
  "/stores/:storeId/orders/:orderId/proposals",
  validate(createStoreOrderProposalSchema),
  createStoreOrderProposalController,
);
sellerRoutes.post(
  "/sales",
  validate(createAutonomousSaleSchema),
  createAutonomousSaleController,
);
