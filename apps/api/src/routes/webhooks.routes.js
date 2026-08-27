import { Router } from "express";
import { asaasWebhookController } from "../modules/payments/asaas.controller.js";

export const webhooksRoutes = Router();

webhooksRoutes.post("/asaas", asaasWebhookController);
