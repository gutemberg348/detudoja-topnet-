import { randomUUID } from "node:crypto";
import { log } from "../config/logger.js";

export function requestLoggerMiddleware(req, res, next) {
  const startedAt = performance.now();
  const requestId = req.get("x-request-id")?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    log(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "http.request_completed", {
      durationMs: Math.round(performance.now() - startedAt),
      method: req.method,
      path: req.path,
      requestId,
      statusCode: res.statusCode,
    });
  });

  next();
}
