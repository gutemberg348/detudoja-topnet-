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

if (nodeEnv === "production") {
  const requiredVariables = [
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ];
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
    name: process.env.COMPANY_ROOT_NAME ?? "DeTudoJa Empresa",
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
  asaas: {
    apiKey: readAsaasApiKey(process.env.ASAAS_API_KEY),
    apiUrl: (process.env.ASAAS_API_URL?.trim() || "https://api-sandbox.asaas.com/v3").replace(/\/$/, ""),
    enabled: process.env.ASAAS_ENABLED === "true",
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
  },
  socialAuth: {
    appleClientIds: readList(process.env.APPLE_OAUTH_CLIENT_IDS),
    googleClientIds: readList(process.env.GOOGLE_OAUTH_CLIENT_IDS),
  },
};
