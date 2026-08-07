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
  uploadStoreMedia,
  uploadStoreProductImage,
} from "../modules/uploads/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const sellerRoutes = Router();

sellerRoutes.get("/segments", listSellerSegmentsController);
sellerRoutes.get("/store-categories", listSellerStoreCategoriesController);
sellerRoutes.get("/profile", getSellerProfileController);
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
