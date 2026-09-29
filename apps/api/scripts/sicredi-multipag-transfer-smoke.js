import "dotenv/config";
import { sicrediMultipagConfigFromEnv } from "../src/modules/payments/sicredi/sicredi.multipag.client.js";
import { runMultipagSandboxTransfer } from "../src/modules/payments/sicredi/sicredi.multipag.sandbox.js";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

function saoPauloToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(new Date());
}

async function main() {
  const [mode, transactionId] = process.argv.slice(2);
  if (process.argv.length !== 4 || !["consultar", "enviar"].includes(mode)) {
    throw new Error("Uso: node sicredi-multipag-transfer-smoke.js consultar|enviar ID_TRANSACAO");
  }
  const config = sicrediMultipagConfigFromEnv();
  const environment = String(process.env.SICREDI_MULTIPAG_ENV ?? "sandbox").trim().toLowerCase();
  if (mode === "enviar" && process.env.SICREDI_MULTIPAG_TEST_CONFIRM !== "CONFIRMO_SANDBOX") {
    throw new Error("Envio exige confirmacao explicita CONFIRMO_SANDBOX");
  }
  const transfer = mode === "enviar" ? {
    amountCents: Number(required("SICREDI_MULTIPAG_TEST_AMOUNT_CENTS")),
    date: process.env.SICREDI_MULTIPAG_TEST_DATE || saoPauloToday(),
    description: "Teste de repasse no Sandbox",
    destinationDocument: required("SICREDI_MULTIPAG_TEST_DESTINATION_DOCUMENT"),
    destinationKey: required("SICREDI_MULTIPAG_TEST_DESTINATION_KEY"),
    destinationKeyType: required("SICREDI_MULTIPAG_TEST_DESTINATION_KEY_TYPE").toUpperCase(),
    destinationName: process.env.SICREDI_MULTIPAG_TEST_DESTINATION_NAME || undefined,
    transactionId,
  } : undefined;
  const result = await runMultipagSandboxTransfer({
    config,
    environment,
    mode,
    transactionId,
    transfer,
  });
  console.log("[sicredi-multipag-pix]", result);
  if (result.action === "solicitacao_enviada") {
    console.log("[sicredi-multipag-pix] Solicitacao criada nao significa Pix liquidado. Consulte o mesmo ID; nao repita o envio.");
  }
}

main().catch((error) => {
  console.error(`[sicredi-multipag-pix] ${error.message}`);
  if (error.providerStateUnknown) {
    console.error("[sicredi-multipag-pix] Estado desconhecido: consulte o MESMO idTransacao antes de qualquer nova tentativa.");
  }
  process.exitCode = 1;
});
