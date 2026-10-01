import { Router } from "express";
import { adminRoutes } from "./admin.routes.js";
import { appRoutes } from "./app.routes.js";
import { healthRoutes } from "./health.routes.js";
import { renderStoreSignupPageController } from "../modules/auth/store-signup.controller.js";
import {
  completeExternalDeliveryController,
  previewExternalDeliveryController,
  renderExternalDeliveryPageController,
} from "../modules/orders/external-delivery.controller.js";
import {
  completeExternalDeliverySchema,
  previewExternalDeliverySchema,
} from "../modules/orders/orders.validator.js";
import { externalDeliveryCodeAttemptRateLimit } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { webhooksRoutes } from "./webhooks.routes.js";

export const router = Router();

router.use("/health", healthRoutes);
router.get("/cadastro/loja/:storeSlug", renderStoreSignupPageController);
router.get("/entrega/externa/:orderId", renderExternalDeliveryPageController);
router.post("/api/public/entrega/:orderId/preview", validate(previewExternalDeliverySchema), previewExternalDeliveryController);
router.post("/api/public/entrega/:orderId/complete", externalDeliveryCodeAttemptRateLimit, validate(completeExternalDeliverySchema), completeExternalDeliveryController);
router.use("/api/webhooks", webhooksRoutes);
router.use("/api/app", appRoutes);
router.use("/api/admin", adminRoutes);
