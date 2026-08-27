import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const skipInTests = () => env.nodeEnv === "test";

export const loginRateLimit = rateLimit({
  message: { message: "Muitas tentativas de acesso. Aguarde um minuto." },
  windowMs: 60 * 1000,
  limit: 10,
  skip: skipInTests,
});

export const registerRateLimit = rateLimit({
  message: { message: "Muitas tentativas de cadastro. Aguarde um minuto." },
  windowMs: 60 * 1000,
  limit: 5,
  skip: skipInTests,
});

export const paymentStatusRefreshRateLimit = rateLimit({
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
