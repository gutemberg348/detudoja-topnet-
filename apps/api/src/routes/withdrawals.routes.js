import { Router } from "express";
import {
  cancelWithdrawalController,
  getWithdrawalPixAccountController,
  getWithdrawalOverviewController,
  requestWithdrawalController,
  saveWithdrawalPixAccountController,
} from "../modules/withdrawals/withdrawal.controller.js";
import { requestWithdrawalSchema } from "../modules/withdrawals/withdrawal.validator.js";
import { payoutAccountSchema } from "../modules/payouts/payout.validator.js";
import {
  payoutPixKeyValidationGatewayRateLimit,
  payoutPixKeyValidationRateLimit,
  withdrawalRequestRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const withdrawalsRoutes = Router();

withdrawalsRoutes.get("/", getWithdrawalOverviewController);
withdrawalsRoutes.get("/pix-account", getWithdrawalPixAccountController);
withdrawalsRoutes.put(
  "/pix-account",
  payoutPixKeyValidationGatewayRateLimit,
  payoutPixKeyValidationRateLimit,
  validate(payoutAccountSchema),
  saveWithdrawalPixAccountController,
);
withdrawalsRoutes.post(
  "/",
  withdrawalRequestRateLimit,
  validate(requestWithdrawalSchema),
  requestWithdrawalController,
);
withdrawalsRoutes.post("/:withdrawalId/cancel", cancelWithdrawalController);
