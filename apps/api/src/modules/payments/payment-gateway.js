import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { sicrediMultipagConfigFromEnv } from "./sicredi/sicredi.multipag.client.js";
import { sicrediPixConfigFromEnv } from "./sicredi/sicredi.pix.client.js";

export const isExternalPixGateway = (gateway) => ["ASAAS", "SICREDI"].includes(gateway);

function runtimeConfiguration() {
  return { ...process.env, ASAAS_ENABLED: String(env.asaas.enabled), ASAAS_API_KEY: env.asaas.apiKey,
    ASAAS_API_URL: env.asaas.apiUrl };
}
function environmentFor(source) {
  return source.PAYMENTS_ENVIRONMENT || (/sandbox/i.test(source.ASAAS_API_URL || "sandbox") ? "sandbox" : "production");
}

export function sicrediEndpointsMatchEnvironment(config, environment, capability) {
  try {
    const api = new URL(config.apiUrl), auth = new URL(config.tokenUrl);
    if ([api, auth].some((url) => url.protocol !== "https:" || url.username || url.password || url.search || url.hash)) return false;
    if (capability === "transfer") {
      const sandbox = environment === "sandbox";
      return api.hostname === "mtls-api-parceiro.sicredi.com.br" && auth.hostname === api.hostname
        && api.pathname.replace(/\/$/, "") === (sandbox ? "/sb/multipag-pagamento-sandbox" : "/multipag")
        && auth.pathname === (sandbox ? "/sb/thirdparty/auth/token" : "/thirdparty/auth/token");
    }
    if ([api, auth].some((url) => !url.hostname.endsWith(".sicredi.com.br"))) return false;
    if (environment === "production") return api.hostname === "api-pix.sicredi.com.br" && auth.hostname === api.hostname;
    // Homologation URLs must be supplied by the bank, not guessed from prod.
    return api.hostname !== "api-pix.sicredi.com.br" && auth.hostname !== "api-pix.sicredi.com.br";
  } catch { return false; }
}

// Selection happens ONCE, before persisting/dispatching an operation. Never
// invoke another provider from a catch block after a financial request.
export function gatewayAvailability(capability, source = runtimeConfiguration()) {
  const config = capability === "transfer"
    ? sicrediMultipagConfigFromEnv(source) : sicrediPixConfigFromEnv(source);
  const environment = environmentFor(source);
  const sicrediEnvironment = capability === "transfer"
    ? source.SICREDI_MULTIPAG_ENV || "sandbox" : source.SICREDI_PIX_ENV;
  const enabled = capability === "transfer"
    ? config.transferEnabled : source.SICREDI_PIX_ENABLED === "true";
  const configured = [config.apiUrl, config.tokenUrl, config.clientId, config.clientSecret,
    config.mtls.certPath, config.mtls.keyPath,
    ...(capability === "transfer" ? [config.conta, config.cooperativa, config.documento] : [config.pixKey]),
  ].every((value) => Boolean(String(value ?? "").trim()));
  const asaasEnvironment = /sandbox/i.test(source.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3")
    ? "sandbox" : "production";
  return {
    ASAAS: source.ASAAS_ENABLED === "true" && Boolean(source.ASAAS_API_KEY?.trim()) && asaasEnvironment === environment,
    SICREDI: Boolean(source.PAYMENTS_ENVIRONMENT) && enabled && configured && sicrediEnvironment === environment
      && sicrediEndpointsMatchEnvironment(config, environment, capability)
      && (environment === "production" || source.SICREDI_APP_SANDBOX_ENABLED === "true"),
  };
}

export function configuredPaymentGateway(source = runtimeConfiguration()) {
  const primary = source.PAYMENTS_PRIMARY_GATEWAY || "SICREDI";
  if (!["SICREDI", "ASAAS"].includes(primary)) {
    throw new AppError("Configuracao de gateways Pix invalida", 503);
  }
  return primary;
}

export function selectPaymentGateway(capability = "receive", source = runtimeConfiguration()) {
  const primary = configuredPaymentGateway(source);
  if (!["sandbox", "production"].includes(environmentFor(source)) || !["receive", "transfer"].includes(capability)) {
    throw new AppError("Configuracao de gateways Pix invalida", 503);
  }
  // Legacy PAYMENTS_FALLBACK_GATEWAY is deliberately ignored. Only an explicit
  // change to PRIMARY selects another bank, even before the first request.
  const available = gatewayAvailability(capability, source);
  if (available[primary]) return primary;
  throw new AppError("Gateway Pix selecionado indisponivel para esta operacao e ambiente", 503);
}

export function isPixGatewayEnabled(capability = "receive") {
  try { selectPaymentGateway(capability); return true; } catch { return false; }
}

export function gatewayEnvironment() {
  return environmentFor(runtimeConfiguration());
}

// Existing operations belong to their persisted bank, regardless of PRIMARY.
// Enabled flags gate new sends only; reconciliation must still be possible.
export function assertTransferEnvironment(record, source = runtimeConfiguration()) {
  const environment = environmentFor(source);
  if (!isExternalPixGateway(record?.gateway) || !["sandbox", "production"].includes(environment)
    || record.gateway_ambiente !== environment) {
    throw new AppError("Transferencia pertence a outro gateway ou ambiente; revisao necessaria", 409);
  }
  const matches = record.gateway === "SICREDI"
    ? (source.SICREDI_MULTIPAG_ENV || "sandbox") === environment
      && sicrediEndpointsMatchEnvironment(sicrediMultipagConfigFromEnv(source), environment, "transfer")
      && (environment !== "sandbox" || source.SICREDI_APP_SANDBOX_ENABLED === "true")
    : (/sandbox/i.test(source.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3") ? "sandbox" : "production") === environment;
  if (!matches) throw new AppError("Transferencia pertence a outro ambiente; revisao necessaria", 409);
}

export function isStoredTransferGatewayEnabled(record, source = runtimeConfiguration()) {
  try {
    assertTransferEnvironment(record, source);
    return gatewayAvailability("transfer", source)[record.gateway] === true;
  } catch { return false; }
}

export function assertSicrediEnvironment(record, capability) {
  const current = capability === "transfer"
    ? process.env.SICREDI_MULTIPAG_ENV || "sandbox" : process.env.SICREDI_PIX_ENV;
  const config = capability === "transfer" ? sicrediMultipagConfigFromEnv() : sicrediPixConfigFromEnv();
  if (!record.gateway_ambiente || record.gateway_ambiente !== current
    || record.gateway_ambiente !== gatewayEnvironment()
    || !sicrediEndpointsMatchEnvironment(config, current, capability)
    || (current === "sandbox" && process.env.SICREDI_APP_SANDBOX_ENABLED !== "true")) {
    throw new AppError("Operacao Sicredi pertence a outro ambiente; nao sera reenviada", 409);
  }
}
