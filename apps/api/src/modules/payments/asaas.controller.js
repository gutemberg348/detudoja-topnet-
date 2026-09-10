import { env } from "../../config/env.js";
import {
  recordWebhookFailure,
  recordWebhookSuccess,
} from "../monitoring/monitoring.service.js";
import { AppError } from "../../utils/errors.js";
import {
  processAsaasWebhook,
  refreshPendingAsaasOrderPayment,
} from "./asaas.service.js";

export async function asaasWebhookController(req, res, next) {
  try {
    if (!env.asaas.webhookToken) {
      throw new AppError("Webhook Asaas nao foi configurado", 503);
    }

    if (req.get("asaas-access-token") !== env.asaas.webhookToken) {
      throw new AppError("Token do webhook Asaas invalido", 401);
    }

    const result = await processAsaasWebhook(req.body);
    recordWebhookSuccess({ event: req.body?.event ?? null });
    res.status(200).json(result);
  } catch (error) {
    recordWebhookFailure(error, {
      event: req.body?.event ?? null,
      statusCode: error.statusCode ?? 500,
    });
    next(error);
  }
}

export async function refreshAsaasOrderPaymentController(req, res, next) {
  try {
    res.json(
      await refreshPendingAsaasOrderPayment(
        req.auth.user.id,
        req.params.orderId,
      ),
    );
  } catch (error) {
    next(error);
  }
}
