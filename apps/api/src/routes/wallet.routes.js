import { Router } from "express";
import {
  walletDetailsController,
  walletOverviewController,
} from "../modules/wallet/wallet.controller.js";
import {
  createWalletDepositController,
  getWalletDepositController,
  refreshWalletDepositController,
} from "../modules/wallet-deposits/wallet-deposit.controller.js";
import { createWalletDepositSchema } from "../modules/wallet-deposits/wallet-deposit.validator.js";
import {
  paymentStatusRefreshRateLimit,
  walletDepositCreateRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const walletRoutes = Router();

walletRoutes.get("/", walletOverviewController);
walletRoutes.post("/deposits", walletDepositCreateRateLimit, validate(createWalletDepositSchema), createWalletDepositController);
walletRoutes.get("/deposits/:depositId", getWalletDepositController);
walletRoutes.post("/deposits/:depositId/refresh", paymentStatusRefreshRateLimit, refreshWalletDepositController);
walletRoutes.get("/:code", walletDetailsController);
