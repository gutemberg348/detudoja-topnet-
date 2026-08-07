import { Router } from "express";
import {
  createLoginController,
  createRefreshController,
  logoutController,
  meController,
} from "../modules/auth/auth.controller.js";
import {
  loginSchema,
  refreshTokenSchema,
} from "../modules/auth/auth.validator.js";
import { authAudiences } from "../modules/auth/auth.service.js";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware.js";
import { loginRateLimit } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminAuthRoutes = Router();

adminAuthRoutes.post(
  "/login",
  loginRateLimit,
  validate(loginSchema),
  createLoginController(authAudiences.admin),
);
adminAuthRoutes.post(
  "/refresh",
  validate(refreshTokenSchema),
  createRefreshController(authAudiences.admin),
);
adminAuthRoutes.get("/me", adminAuthMiddleware, meController);
adminAuthRoutes.post("/logout", adminAuthMiddleware, logoutController);
