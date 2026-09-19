import { Router } from "express";
import {
  getChargeForCustomerController,
  getPermanentStoreQrForCustomerController,
  createPermanentStoreQrPaymentController,
  payChargeController,
  payChargeWithWalletController,
} from "../modules/charges/charge.controller.js";
import {
  payChargeSchema,
  payPermanentStoreQrSchema,
} from "../modules/charges/charge.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const paymentsRoutes = Router();

paymentsRoutes.get("/charges/:code", getChargeForCustomerController);
paymentsRoutes.post(
  "/charges/:code/pay",
  validate(payChargeSchema),
  payChargeController,
);
paymentsRoutes.post(
  "/charges/:code/pay-with-wallet",
  validate(payChargeSchema),
  payChargeWithWalletController,
);
paymentsRoutes.get("/store-qr/:token", getPermanentStoreQrForCustomerController);
paymentsRoutes.post(
  "/store-qr/:token/pay",
  validate(payPermanentStoreQrSchema),
  createPermanentStoreQrPaymentController,
);
