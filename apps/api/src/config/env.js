import "dotenv/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

function readList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readAsaasApiKey(value) {
  const apiKey = value?.trim() || null;

  // The provider issues keys with a leading "$"; preserve it when copied correctly.
  // This also accepts a common .env paste that omitted only that required character.
  if (!apiKey || apiKey.startsWith("$")) {
    return apiKey;
  }

  return /^aact_(?:hmlg|prod)_/.test(apiKey) ? `$${apiKey}` : apiKey;
}

function readThreshold(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function readRatio(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

if (nodeEnv === "production") {
  const requiredVariables = [
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ];

  if (process.env.REDIS_REQUIRED !== "false") {
    requiredVariables.push("REDIS_URL");
  }
  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable],
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing production environment variables: ${missingVariables.join(", ")}`,
    );
  }

  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error("JWT access and refresh secrets must be different");
  }
}

if (process.env.ASAAS_ENABLED === "true") {
  const missingAsaasVariables = ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"].filter(
    (variable) => !process.env[variable]?.trim(),
  );

  if (missingAsaasVariables.length > 0) {
    throw new Error(
      `Missing Asaas environment variables: ${missingAsaasVariables.join(", ")}`,
    );
  }
}

export const env = {
  adminSeed: {
    email:
      process.env.ADMIN_SEED_EMAIL ??
      process.env.AUTH_USER_EMAIL ??
      "admin@detudoja.local",
    name:
      process.env.ADMIN_SEED_NAME ??
      process.env.AUTH_USER_NAME ??
      "Administrador Local",
    password:
      process.env.ADMIN_SEED_PASSWORD ??
      process.env.AUTH_USER_PASSWORD ??
      "change-me-now",
    phone:
      process.env.ADMIN_SEED_PHONE ??
      process.env.AUTH_USER_PHONE ??
      "11999990000",
  },
  corsOrigins: (
    process.env.CORS_ORIGIN ??
    "http://localhost:5173,http://localhost:8081,http://localhost:8082"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  companyRoot: {
    email: process.env.COMPANY_ROOT_EMAIL ?? "empresa@detudoja.local",
    name: process.env.COMPANY_ROOT_NAME ?? "Brasil Cashback Empresa",
  },
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://admin:adimin@localhost:5432/meu_banco?schema=public",
  jwt: {
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? "local-access-secret-change-me",
    issuer: process.env.JWT_ISSUER ?? "detudoja-api",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? "local-refresh-secret-change-me",
  },
  host: process.env.HOST?.trim() || "0.0.0.0",
  nodeEnv,
  port: Number(process.env.PORT ?? 3333),
  publicLinks: {
    apiBaseUrl: process.env.PUBLIC_API_URL?.trim().replace(/\/$/, "") || null,
    appDownloadUrl: process.env.APP_DOWNLOAD_URL?.trim() || null,
  },
  redis: {
    required:
      process.env.REDIS_REQUIRED === "true" ||
      (nodeEnv === "production" && process.env.REDIS_REQUIRED !== "false"),
    url: process.env.REDIS_URL?.trim() || null,
  },
  passwordReset: {
    expiresMinutes: Math.max(5, Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? 30)),
    url: process.env.PASSWORD_RESET_URL?.trim() || "detudoja://redefinir-senha",
  },
  orders: {
    unattendedTimeoutMinutes: Math.min(
      Math.max(15, Number(process.env.ORDER_UNATTENDED_TIMEOUT_MINUTES ?? 60)),
      1_440,
    ),
  },
  serviceAvailability: {
    heartbeatTimeoutSeconds: Math.min(
      Math.max(60, Number(process.env.SERVICE_AVAILABILITY_TIMEOUT_SECONDS ?? 120)),
      600,
    ),
  },
  services: {
    confirmationTimeoutMinutes: Math.min(
      Math.max(60, Number(process.env.SERVICE_CONFIRMATION_TIMEOUT_MINUTES ?? 2_880)),
      20_160,
    ),
    unattendedTimeoutMinutes: Math.min(
      Math.max(60, Number(process.env.SERVICE_UNATTENDED_TIMEOUT_MINUTES ?? 1_440)),
      10_080,
    ),
  },
  monitoring: {
    alertCooldownMs: Math.max(60_000, Number(process.env.ALERT_COOLDOWN_MS ?? 300_000)),
    alertWebhookFormat: ["discord", "generic", "slack"].includes(process.env.ALERT_WEBHOOK_FORMAT)
      ? process.env.ALERT_WEBHOOK_FORMAT
      : "generic",
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL?.trim() || null,
    token: process.env.MONITORING_TOKEN?.trim() || null,
  },
  push: {
    enabled: process.env.EXPO_PUSH_ENABLED === "true",
    accessToken: process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || null,
  },
  kyc: {
    automaticApprovalEnabled: process.env.KYC_AUTOMATIC_APPROVAL_ENABLED === "true"
      || (nodeEnv !== "production" && process.env.KYC_AUTOMATIC_APPROVAL_ENABLED !== "false"),
    antispoofThreshold: readThreshold(process.env.KYC_ANTISPOOF_THRESHOLD, 0.6),
    calibrationSampleRate: readRatio(process.env.KYC_CALIBRATION_SAMPLE_RATE, nodeEnv === "production" ? 1 : 0),
    faceMatchThreshold: readThreshold(process.env.KYC_FACE_MATCH_THRESHOLD, 0.65),
    livenessThreshold: readThreshold(process.env.KYC_LIVENESS_THRESHOLD, 0.5),
    minimumFaceArea: readThreshold(process.env.KYC_MINIMUM_FACE_AREA, 0.06),
    mode: process.env.KYC_MODE === "manual" ? "manual" : "automatic",
    nameMatchThreshold: readThreshold(process.env.KYC_NAME_MATCH_THRESHOLD, 0.8),
    ocrConfidenceThreshold: readThreshold(process.env.KYC_OCR_CONFIDENCE_THRESHOLD, 0.65) * 100,
  },
  smtp: {
    from: process.env.SMTP_FROM?.trim() || null,
    host: process.env.SMTP_HOST?.trim() || null,
    password: process.env.SMTP_PASSWORD || null,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() || null,
  },
  asaas: {
    apiKey: readAsaasApiKey(process.env.ASAAS_API_KEY),
    apiUrl: (process.env.ASAAS_API_URL?.trim() || "https://api-sandbox.asaas.com/v3").replace(/\/$/, ""),
    enabled: process.env.ASAAS_ENABLED === "true",
    reconciliationGraceSeconds: Math.min(
      Math.max(60, Number(process.env.ASAAS_RECONCILIATION_GRACE_SECONDS ?? 300)),
      1_800,
    ),
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
  },
  socialAuth: {
    appleClientIds: readList(process.env.APPLE_OAUTH_CLIENT_IDS),
    googleClientIds: readList(process.env.GOOGLE_OAUTH_CLIENT_IDS),
  },
};
