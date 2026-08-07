import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { uploadsBasePath, uploadsRoot } from "./config/storage.js";
import { router } from "./routes/index.routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

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
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
  }),
);

app.use(router);
app.use(errorMiddleware);
