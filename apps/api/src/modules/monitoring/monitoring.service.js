import { env } from "../../config/env.js";
import { log, logError } from "../../config/logger.js";

const startedAt = new Date();
const components = new Map();
const alertCooldowns = new Map();
let webhookState = {
  failedCount: 0,
  lastFailureAt: null,
  lastReceivedAt: null,
  lastSuccessAt: null,
};

function nowIso() {
  return new Date().toISOString();
}

function summarizeError(error) {
  return {
    code: error?.code ?? null,
    message: error?.message ?? String(error ?? "Unknown error"),
    name: error?.name ?? "Error",
  };
}

function componentSnapshot(name) {
  return components.get(name) ?? {
    consecutiveFailures: 0,
    lastFailure: null,
    lastFailureAt: null,
    lastSuccessAt: null,
    status: "starting",
  };
}

function formatAlert(alert) {
  return `[Brasil Cashback] ${alert.component}: ${alert.message}`;
}

async function deliverAlert(alert) {
  const url = env.monitoring.alertWebhookUrl;
  if (!url) return;

  const body = env.monitoring.alertWebhookFormat === "discord"
    ? { content: formatAlert(alert) }
    : env.monitoring.alertWebhookFormat === "slack"
      ? { text: formatAlert(alert) }
      : alert;

  try {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`Alert webhook responded with ${response.status}`);
    }
  } catch (error) {
    logError("monitoring.alert_delivery_failed", error, { component: alert.component });
  }
}

function notifyFailure(component, error, context) {
  const key = `${component}:${error?.code ?? error?.name ?? "error"}`;
  const previous = alertCooldowns.get(key) ?? 0;
  const now = Date.now();

  if (now - previous < env.monitoring.alertCooldownMs) {
    return;
  }

  alertCooldowns.set(key, now);
  void deliverAlert({
    component,
    context,
    message: summarizeError(error).message,
    occurredAt: nowIso(),
    severity: "error",
  });
}

export function recordComponentStarting(component) {
  components.set(component, { ...componentSnapshot(component), status: "starting" });
}

export function recordComponentSuccess(component, details = {}) {
  components.set(component, {
    consecutiveFailures: 0,
    details,
    lastFailure: null,
    lastFailureAt: null,
    lastSuccessAt: nowIso(),
    status: "healthy",
  });
}

export function recordComponentFailure(component, error, details = {}) {
  const previous = componentSnapshot(component);
  const failure = summarizeError(error);
  components.set(component, {
    consecutiveFailures: previous.consecutiveFailures + 1,
    details,
    lastFailure: failure,
    lastFailureAt: nowIso(),
    lastSuccessAt: previous.lastSuccessAt,
    status: "failed",
  });

  logError("monitoring.component_failed", error, { component, ...details });
  notifyFailure(component, error, details);
}

export function recordWebhookSuccess({ event = null } = {}) {
  webhookState = {
    ...webhookState,
    lastReceivedAt: nowIso(),
    lastSuccessAt: nowIso(),
  };
  log("info", "asaas.webhook_processed", { event });
}

export function recordWebhookFailure(error, { event = null, statusCode = 500 } = {}) {
  webhookState = {
    ...webhookState,
    failedCount: webhookState.failedCount + 1,
    lastFailureAt: nowIso(),
    lastReceivedAt: nowIso(),
  };

  logError("asaas.webhook_failed", error, { event, statusCode });
  if (statusCode >= 500) {
    notifyFailure("asaas-webhook", error, { event, statusCode });
  }
}

export function recordFinancialFailure(component, message, details = {}) {
  const error = new Error(message);
  logError("monitoring.financial_operation_failed", error, { component, ...details });
  notifyFailure(component, error, details);
}

export function getOperationalStatus() {
  const componentEntries = [...components.entries()].map(([name, state]) => ({ name, ...state }));
  const degraded = componentEntries.some((component) => component.status === "failed");

  return {
    components: componentEntries,
    degraded,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1_000),
    webhook: webhookState,
  };
}

export function buildPrometheusMetrics() {
  const status = getOperationalStatus();
  const lines = [
    "# HELP detudoja_process_uptime_seconds API process uptime in seconds.",
    "# TYPE detudoja_process_uptime_seconds gauge",
    `detudoja_process_uptime_seconds ${status.uptimeSeconds}`,
    "# HELP detudoja_component_healthy Component health, 1 is healthy.",
    "# TYPE detudoja_component_healthy gauge",
    "# HELP detudoja_component_consecutive_failures Consecutive component failures.",
    "# TYPE detudoja_component_consecutive_failures gauge",
  ];

  for (const component of status.components) {
    const name = component.name.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`detudoja_component_healthy{component="${name}"} ${component.status === "healthy" ? 1 : 0}`);
    lines.push(`detudoja_component_consecutive_failures{component="${name}"} ${component.consecutiveFailures}`);
  }

  lines.push("# HELP detudoja_asaas_webhook_failures_total Webhook failures observed by this API instance.");
  lines.push("# TYPE detudoja_asaas_webhook_failures_total counter");
  lines.push(`detudoja_asaas_webhook_failures_total ${status.webhook.failedCount}`);
  return `${lines.join("\n")}\n`;
}
