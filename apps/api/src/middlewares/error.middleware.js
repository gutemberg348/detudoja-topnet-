export function errorMiddleware(error, _req, res, _next) {
  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    console.error("[API] Unhandled error", error);
  }

  const response = {
    message: statusCode === 500 ? "Internal server error" : error.message,
  };

  if (statusCode < 500 && error.details) {
    response.details = error.details;
  }

  res.status(statusCode).json(response);
}
