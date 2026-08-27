import { Router } from "express";
import { adminRoutes } from "./admin.routes.js";
import { appRoutes } from "./app.routes.js";
import { healthRoutes } from "./health.routes.js";
import { renderStoreSignupPageController } from "../modules/auth/store-signup.controller.js";
import { webhooksRoutes } from "./webhooks.routes.js";

export const router = Router();

router.use("/health", healthRoutes);
router.get("/cadastro/loja/:storeSlug", renderStoreSignupPageController);
router.use("/api/webhooks", webhooksRoutes);
router.use("/api/app", appRoutes);
router.use("/api/admin", adminRoutes);
