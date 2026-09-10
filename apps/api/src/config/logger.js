import { env } from "./env.js";

function serializeError(error) {
  if (!error) return null;

  return {
    code: error.code ?? null,
    message: error.message ?? String(error),
    name: error.name ?? "Error",
    stack: error.stack ?? null,
    statusCode: error.statusCode ?? null,
  };
}

export function log(level, event, context = {}) {
  if (env.nodeEnv === "test" && process.env.LOG_TEST_OUTPUT !== "true") {
    return;
  }

  const entry = {
    event,
    level,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  writer(JSON.stringify(entry));
}

export function logError(event, error, context = {}) {
  log("error", event, { ...context, error: serializeError(error) });
}
