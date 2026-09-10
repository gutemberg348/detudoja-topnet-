import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { getRedisClient, isRedisReady } from "../config/redis.js";

const skipInTests = () => env.nodeEnv === "test";

export function createRateLimiter({ keyPrefix, ...options }) {
  const store = isRedisReady()
    ? new RedisStore({
      prefix: `detudoja:rate-limit:${keyPrefix}:`,
      sendCommand: (...args) => {
        const client = getRedisClient();
        if (!client) {
          return Promise.reject(new Error("Redis is not connected"));
        }

        return client.call(...args);
      },
    })
    : undefined;

  return rateLimit({ ...options, ...(store ? { store } : {}) });
}

export const friendInvitationRateLimit = createRateLimiter({
  keyPrefix: "friend-invitation",
  keyGenerator: (req) => `friend-invitation:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 12,
  message: { message: "Muitos convites enviados. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 10 * 60 * 1000,
});

export const friendLookupRateLimit = createRateLimiter({
  keyPrefix: "friend-lookup",
  keyGenerator: (req) => `friend-lookup:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 60,
  message: { message: "Muitas buscas de contatos. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 10 * 60 * 1000,
});

export const personalMessageRateLimit = createRateLimiter({
  keyPrefix: "personal-message",
  keyGenerator: (req) => `personal-message:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 90,
  message: { message: "Muitas mensagens enviadas. Aguarde um minuto." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const loginRateLimit = createRateLimiter({
  keyPrefix: "login",
  message: { message: "Muitas tentativas de acesso. Aguarde um minuto." },
  windowMs: 60 * 1000,
  limit: 10,
  skip: skipInTests,
});

export const registerRateLimit = createRateLimiter({
  keyPrefix: "register",
  message: { message: "Muitas tentativas de cadastro. Aguarde um minuto." },
  windowMs: 60 * 1000,
  limit: 5,
  skip: skipInTests,
});

export const passwordResetRequestRateLimit = createRateLimiter({
  keyPrefix: "password-reset-request",
  legacyHeaders: false,
  limit: 5,
  message: { message: "Muitos pedidos de recuperacao. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 15 * 60 * 1000,
});

export const passwordResetConfirmRateLimit = createRateLimiter({
  keyPrefix: "password-reset-confirm",
  legacyHeaders: false,
  limit: 8,
  message: { message: "Muitas tentativas de redefinicao. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 15 * 60 * 1000,
});

export const paymentStatusRefreshRateLimit = createRateLimiter({
  keyPrefix: "payment-status-refresh",
  keyGenerator: (req) => `user:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 5,
  message: {
    message: "Muitas consultas de pagamento. Aguarde um minuto e tente novamente.",
  },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const walletDepositCreateRateLimit = createRateLimiter({
  keyPrefix: "wallet-deposit-create",
  keyGenerator: (req) => `wallet-deposit:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 5,
  message: { message: "Muitas recargas Pix foram geradas. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 10 * 60 * 1000,
});

export const withdrawalRequestRateLimit = createRateLimiter({
  keyPrefix: "withdrawal-request",
  keyGenerator: (req) => `withdrawal:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 3,
  message: { message: "Muitas solicitacoes de saque. Aguarde um minuto." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const payoutPixKeyValidationRateLimit = createRateLimiter({
  keyPrefix: "payout-pix-key-validation-user",
  keyGenerator: (req) => `payout-pix-key:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 2,
  message: { message: "Muitas validacoes de chave Pix. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 10 * 60 * 1000,
});

export const payoutPixKeyValidationGatewayRateLimit = createRateLimiter({
  keyPrefix: "payout-pix-key-validation-gateway",
  keyGenerator: () => "asaas-external-pix-key",
  legacyHeaders: false,
  limit: 4,
  message: { message: "A validacao Pix esta temporariamente ocupada. Aguarde um minuto." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const courierRequestCreateRateLimit = createRateLimiter({
  keyPrefix: "courier-request-create",
  keyGenerator: (req) => `courier-request-create:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 6,
  message: { message: "Muitas chamadas de motoboy. Aguarde alguns minutos." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 10 * 60 * 1000,
});

export const courierRequestAcceptRateLimit = createRateLimiter({
  keyPrefix: "courier-request-accept",
  keyGenerator: (req) => `courier-request-accept:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 10,
  message: { message: "Muitas tentativas de aceitar corridas. Aguarde um minuto." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const courierRequestCancelRateLimit = createRateLimiter({
  keyPrefix: "courier-request-cancel",
  keyGenerator: (req) => `courier-request-cancel:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 8,
  message: { message: "Muitos cancelamentos de corrida. Aguarde um minuto." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const serviceMessageRateLimit = createRateLimiter({
  keyPrefix: "service-message",
  keyGenerator: (req) => `service-message:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 45,
  message: { message: "Muitas mensagens enviadas. Aguarde um minuto." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 1000,
});

export const serviceAvailabilityHeartbeatRateLimit = createRateLimiter({
  keyPrefix: "service-availability-heartbeat",
  keyGenerator: (req) => `service-availability-heartbeat:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 30,
  message: { message: "Muitas atualizacoes de disponibilidade. Aguarde um momento." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 10 * 60 * 1000,
});

export const kycSubmissionRateLimit = createRateLimiter({
  keyPrefix: "kyc-submission",
  keyGenerator: (req) => `kyc:${req.auth.user.id}`,
  legacyHeaders: false,
  limit: 3,
  message: { message: "Muitos envios de documentos. Aguarde antes de tentar novamente." },
  skip: skipInTests,
  standardHeaders: "draft-7",
  windowMs: 60 * 60 * 1000,
});
