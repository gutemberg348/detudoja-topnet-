import { logError } from "../config/logger.js";

export function errorMiddleware(error, req, res, _next) {
  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    logError("http.unhandled_error", error, {
      method: req.method,
      path: req.path,
      requestId: req.requestId ?? null,
      statusCode,
    });
  }

  const response = {
    message: statusCode === 500 ? "Internal server error" : error.message,
  };

  if (statusCode < 500 && error.details) {
    response.details = error.details;
  }

  res.status(statusCode).json(response);
}
