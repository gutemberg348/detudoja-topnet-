import "dotenv/config";
import { gatewayAvailability, selectPaymentGateway, gatewayEnvironment } from "../src/modules/payments/payment-gateway.js";
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
