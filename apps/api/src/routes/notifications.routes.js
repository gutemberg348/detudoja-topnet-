import { Router } from "express";
import {
  registerPushTokenController,
  unregisterPushTokenController,
} from "../modules/notifications/notifications.controller.js";
import {
  registerPushTokenSchema,
  unregisterPushTokenSchema,
} from "../modules/notifications/notifications.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const notificationsRoutes = Router();

notificationsRoutes.put("/push-token", validate(registerPushTokenSchema), registerPushTokenController);
notificationsRoutes.delete("/push-token", validate(unregisterPushTokenSchema), unregisterPushTokenController);
