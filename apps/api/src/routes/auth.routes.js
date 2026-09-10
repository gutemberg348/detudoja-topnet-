import { Router } from "express";
import {
  completeCpfController,
  createLoginController,
  createRegisterController,
  createRefreshController,
  createSocialLoginController,
  logoutController,
  meController,
  requestPasswordResetController,
  resetPasswordController,
} from "../modules/auth/auth.controller.js";
import {
  completeCpfSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshTokenSchema,
  registrationSchema,
  socialLoginSchema,
} from "../modules/auth/auth.validator.js";
import { authAudiences } from "../modules/auth/auth.service.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  loginRateLimit,
  passwordResetConfirmRateLimit,
  passwordResetRequestRateLimit,
  registerRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  loginRateLimit,
  validate(loginSchema),
  createLoginController(authAudiences.app),
);
authRoutes.post(
  "/social",
  loginRateLimit,
  validate(socialLoginSchema),
  createSocialLoginController(authAudiences.app),
);
authRoutes.post(
  "/register",
  registerRateLimit,
  validate(registrationSchema),
  createRegisterController(authAudiences.app),
);
authRoutes.post(
  "/password-reset/request",
  passwordResetRequestRateLimit,
  validate(passwordResetRequestSchema),
  requestPasswordResetController,
);
authRoutes.post(
  "/password-reset/confirm",
  passwordResetConfirmRateLimit,
  validate(passwordResetConfirmSchema),
  resetPasswordController,
);
authRoutes.post(
  "/refresh",
  validate(refreshTokenSchema),
  createRefreshController(authAudiences.app),
);
authRoutes.post(
  "/complete-cpf",
  authMiddleware,
  validate(completeCpfSchema),
  completeCpfController,
);
authRoutes.get("/me", authMiddleware, meController);
authRoutes.post(
  "/logout",
  authMiddleware,
  validate(refreshTokenSchema),
  logoutController,
);
