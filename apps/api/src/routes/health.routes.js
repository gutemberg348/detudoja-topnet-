import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { isRedisReady } from "../config/redis.js";
import {
  buildPrometheusMetrics,
  getOperationalStatus,
} from "../modules/monitoring/monitoring.service.js";

export const healthRoutes = Router();

healthRoutes.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

healthRoutes.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisReady = isRedisReady();

    if (env.redis.required && !redisReady) {
      res.status(503).json({ status: "unavailable", database: "ok", redis: "unavailable" });
      return;
    }

    res.json({
      status: "ok",
      database: "ok",
      redis: redisReady ? "ok" : "disabled",
    });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

function requireMonitoringToken(req, res) {
  if (!env.monitoring.token) {
    res.sendStatus(404);
    return false;
  }

  if (req.get("authorization") !== `Bearer ${env.monitoring.token}`) {
    res.sendStatus(401);
    return false;
  }

  return true;
}

healthRoutes.get("/operations", (req, res) => {
  if (!requireMonitoringToken(req, res)) return;

  const status = getOperationalStatus();
  res.status(status.degraded ? 503 : 200).json(status);
});

healthRoutes.get("/metrics", (req, res) => {
  if (!requireMonitoringToken(req, res)) return;

  res.type("text/plain; version=0.0.4").send(buildPrometheusMetrics());
});
