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
  if (capability === "receive" && !available.SICREDI) {
    const required = ["PAYMENTS_ENVIRONMENT", "SICREDI_PIX_ENV", "SICREDI_PIX_API_URL",
      "SICREDI_PIX_AUTH_URL", "SICREDI_PIX_CLIENT_ID", "SICREDI_PIX_CLIENT_SECRET",
      "SICREDI_PIX_RECEIVING_KEY", "SICREDI_PIX_CERT_PATH", "SICREDI_PIX_KEY_PATH"];
    const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
    const config = sicrediPixConfigFromEnv();
    console.log("[gateways] Pix recebimento Sicredi indisponivel:", {
      missingVariables: missing,
      pixEnabled: process.env.SICREDI_PIX_ENABLED === "true",
      sandboxAppEnabled: gatewayEnvironment() !== "sandbox" || process.env.SICREDI_APP_SANDBOX_ENABLED === "true",
      sameEnvironment: process.env.SICREDI_PIX_ENV === gatewayEnvironment(),
      validEnvironmentUrls: sicrediEndpointsMatchEnvironment(config, gatewayEnvironment(), "receive"),
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
