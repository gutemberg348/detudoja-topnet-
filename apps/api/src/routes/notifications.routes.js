import { Router } from "express";
import {
  registerPushTokenController,
  unregisterPushTokenController,
  pushStatusController,
  testPushController,
} from "../modules/notifications/notifications.controller.js";
import {
  registerPushTokenSchema,
  unregisterPushTokenSchema,
} from "../modules/notifications/notifications.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createRateLimiter } from "../middlewares/rate-limit.middleware.js";

export const notificationsRoutes = Router();
const testLimiter = createRateLimiter({
  keyPrefix: "notification-test", keyGenerator: (req) => `user:${req.auth.user.id}`,
  windowMs: 60_000, limit: 3, standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Aguarde um minuto antes de enviar outro aviso de teste." },
});

notificationsRoutes.get("/status", pushStatusController);
notificationsRoutes.post("/test", testLimiter, validate(unregisterPushTokenSchema), testPushController);
notificationsRoutes.put("/push-token", validate(registerPushTokenSchema), registerPushTokenController);
notificationsRoutes.delete("/push-token", validate(unregisterPushTokenSchema), unregisterPushTokenController);
