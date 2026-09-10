import { Router } from "express";
import {
  approveWithdrawalController,
  listAdminWithdrawalsController,
  refreshWithdrawalController,
  rejectWithdrawalController,
} from "../modules/withdrawals/withdrawal.controller.js";
import { rejectWithdrawalSchema } from "../modules/withdrawals/withdrawal.validator.js";
import { paymentStatusRefreshRateLimit } from "../middlewares/rate-limit.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminWithdrawalsRoutes = Router();

adminWithdrawalsRoutes.get("/", listAdminWithdrawalsController);
adminWithdrawalsRoutes.post(
  "/:withdrawalId/approve",
  roleMiddleware("super_admin", "financeiro"),
  approveWithdrawalController,
);
adminWithdrawalsRoutes.post(
  "/:withdrawalId/reject",
  roleMiddleware("super_admin", "financeiro"),
  validate(rejectWithdrawalSchema),
  rejectWithdrawalController,
);
adminWithdrawalsRoutes.post(
  "/:withdrawalId/refresh",
  roleMiddleware("super_admin", "financeiro"),
  paymentStatusRefreshRateLimit,
  refreshWithdrawalController,
);
