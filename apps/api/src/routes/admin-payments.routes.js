import { Router } from "express";
import {
  listAdminPaymentsController,
  refreshAdminAsaasRefundPaymentController,
  refundAdminPaymentController,
  approveAdminSandboxPaymentController,
} from "../modules/admin/admin-payments.controller.js";
import { refundAdminPaymentSchema, sandboxPaymentApprovalSchema } from "../modules/admin/admin.validator.js";
import { paymentStatusRefreshRateLimit } from "../middlewares/rate-limit.middleware.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminPaymentsRoutes = Router();

adminPaymentsRoutes.get("/", listAdminPaymentsController);
adminPaymentsRoutes.post(
  "/:paymentId/sandbox-approve",
  roleMiddleware("super_admin", "financeiro"),
  paymentStatusRefreshRateLimit,
  validate(sandboxPaymentApprovalSchema),
  approveAdminSandboxPaymentController,
);
adminPaymentsRoutes.post(
  "/:paymentId/refund",
  roleMiddleware("super_admin", "financeiro"),
  validate(refundAdminPaymentSchema),
  refundAdminPaymentController,
);
adminPaymentsRoutes.post(
  "/:paymentId/refund/refresh",
  roleMiddleware("super_admin", "financeiro"),
  paymentStatusRefreshRateLimit,
  refreshAdminAsaasRefundPaymentController,
);
