import { Router } from "express";
import { adminRoutes } from "./admin.routes.js";
import { appRoutes } from "./app.routes.js";
import { healthRoutes } from "./health.routes.js";
import { renderStoreSignupPageController } from "../modules/auth/store-signup.controller.js";

export const router = Router();

router.use("/health", healthRoutes);
router.get("/cadastro/loja/:storeSlug", renderStoreSignupPageController);
router.use("/api/app", appRoutes);
router.use("/api/admin", adminRoutes);
