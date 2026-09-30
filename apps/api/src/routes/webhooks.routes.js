import { Router } from "express";
import { asaasWebhookController } from "../modules/payments/asaas.controller.js";
import { rateLimit } from "express-rate-limit";
import { sicrediPixWebhookController, sicrediMultipagWebhookController } from "../modules/payments/sicredi/sicredi.webhook.controller.js";

export const webhooksRoutes = Router();

webhooksRoutes.post("/asaas", asaasWebhookController);

const sicrediLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
webhooksRoutes.post("/sicredi/pix/:token/pix", sicrediLimiter, sicrediPixWebhookController);
webhooksRoutes.post("/sicredi/multipag", sicrediLimiter, sicrediMultipagWebhookController);
