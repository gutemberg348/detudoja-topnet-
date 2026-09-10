import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { uploadsBasePath, uploadsRoot } from "./config/storage.js";
import { router } from "./routes/index.routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { createRateLimiter } from "./middlewares/rate-limit.middleware.js";
import { requestLoggerMiddleware } from "./middlewares/request-logger.middleware.js";

export const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(
  uploadsBasePath,
  express.static(uploadsRoot, {
    immutable: true,
    maxAge: "30d",
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(requestLoggerMiddleware);
app.use(
  createRateLimiter({
    keyPrefix: "global",
    message: { message: "Muitas solicitacoes. Aguarde um minuto e tente novamente." },
    skip: (req) => env.nodeEnv === "test" || req.path === "/api/webhooks/asaas",
    standardHeaders: true,
    legacyHeaders: false,
    windowMs: 60 * 1000,
    // A navegacao autenticada carrega contadores independentes e recebe
    // atualizacoes em tempo real. Operacoes sensiveis possuem limites proprios.
    limit: 360,
  }),
);

app.use(router);
app.use(errorMiddleware);
