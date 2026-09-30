import "dotenv/config";
import { gatewayAvailability, selectPaymentGateway, gatewayEnvironment, sicrediEndpointsMatchEnvironment } from "../src/modules/payments/payment-gateway.js";
import { sicrediPixConfigFromEnv } from "../src/modules/payments/sicredi/sicredi.pix.client.js";
import { sicrediMultipagConfigFromEnv } from "../src/modules/payments/sicredi/sicredi.multipag.client.js";
import { readSicrediMtls } from "../src/modules/payments/sicredi/sicredi.transport.js";

// Read-only local diagnostics. Never prints secrets or invokes any bank API.
console.log("[gateways] Ambiente:", gatewayEnvironment());
for (const capability of ["receive", "transfer"]) {
  const available = gatewayAvailability(capability);
  let selected = "INDISPONIVEL";
  try { selected = selectPaymentGateway(capability); } catch { process.exitCode = 1; }
  console.log("[gateways]", { fluxo: capability === "receive" ? "checkout/QR/depositos" : "saques/repasses", selected, configured: available });
  if (!available.SICREDI) {
    const transfer = capability === "transfer";
    const config = transfer ? sicrediMultipagConfigFromEnv() : sicrediPixConfigFromEnv();
    const required = transfer
      ? ["PAYMENTS_ENVIRONMENT", "SICREDI_MULTIPAG_CLIENT_ID", "SICREDI_MULTIPAG_CLIENT_SECRET",
        "SICREDI_MULTIPAG_CONTA", "SICREDI_MULTIPAG_COOPERATIVA", "SICREDI_MULTIPAG_DOCUMENTO"]
      : ["PAYMENTS_ENVIRONMENT", "SICREDI_PIX_ENV", "SICREDI_PIX_API_URL",
        "SICREDI_PIX_AUTH_URL", "SICREDI_PIX_CLIENT_ID", "SICREDI_PIX_CLIENT_SECRET",
        "SICREDI_PIX_RECEIVING_KEY"];
    const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
    if (!config.mtls.certPath) missing.push(transfer
      ? "SICREDI_MULTIPAG_CERT_PATH" : "SICREDI_PIX_CERT_PATH ou SICREDI_MULTIPAG_CERT_PATH");
    if (!config.mtls.keyPath) missing.push(transfer
      ? "SICREDI_MULTIPAG_KEY_PATH" : "SICREDI_PIX_KEY_PATH ou SICREDI_MULTIPAG_KEY_PATH");
    console.log(`[gateways] Sicredi ${transfer ? "Multipag transferencias" : "Pix recebimento"} indisponivel:`, {
      missingVariables: missing,
      enabled: transfer ? config.transferEnabled : process.env.SICREDI_PIX_ENABLED === "true",
      sandboxAppEnabled: gatewayEnvironment() !== "sandbox" || process.env.SICREDI_APP_SANDBOX_ENABLED === "true",
      sameEnvironment: (transfer ? process.env.SICREDI_MULTIPAG_ENV || "sandbox" : process.env.SICREDI_PIX_ENV) === gatewayEnvironment(),
      validEnvironmentUrls: sicrediEndpointsMatchEnvironment(config, gatewayEnvironment(), capability),
    });
  }
  if (selected === "SICREDI") {
    try {
      const config = capability === "receive" ? sicrediPixConfigFromEnv() : sicrediMultipagConfigFromEnv();
      const agent = await readSicrediMtls(config.mtls);
      agent.destroy();
      console.log("[gateways]", capability, "certificado/chave correspondem e estao legiveis pelo usuario do container.");
    } catch {
      console.error("[gateways]", capability, "falha local no certificado/chave/cadeia. Verifique montagem e permissoes; nao habilite envios.");
      process.exitCode = 1;
    }
  }
}
console.log("[gateways] Nao houve autenticacao, cobranca ou transferencia bancaria. Configurado nao significa homologado.");
