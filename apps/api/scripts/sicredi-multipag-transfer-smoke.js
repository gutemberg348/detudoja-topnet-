import "dotenv/config";
import { sicrediMultipagConfigFromEnv } from "../src/modules/payments/sicredi/sicredi.multipag.client.js";
import { MULTIPAG_SANDBOX_EXAMPLE, runMultipagSandboxTransfer, runMultipagSandboxExample } from "../src/modules/payments/sicredi/sicredi.multipag.sandbox.js";

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
  let [mode, transactionId] = process.argv.slice(2);
  const example = mode === "consultar-exemplo" || mode === "enviar-exemplo";
  if ((!example && process.argv.length !== 4) || (example && process.argv.length !== 3)
    || !["consultar", "enviar", "consultar-exemplo", "enviar-exemplo"].includes(mode)) {
    throw new Error("Uso: node sicredi-multipag-transfer-smoke.js consultar|enviar ID_TRANSACAO ou consultar-exemplo|enviar-exemplo");
  }
  const config = sicrediMultipagConfigFromEnv();
  const environment = String(process.env.SICREDI_MULTIPAG_ENV ?? "sandbox").trim().toLowerCase();
  if (mode === "enviar-exemplo") {
    console.log("[sicredi-multipag-pix] POST do exemplo de Sandbox: 0910F3HT1, R$ 20,10. A data utilizada aparece na etapa abaixo.");
    const result = await runMultipagSandboxExample({
      config, environment, confirmation: process.env.SICREDI_MULTIPAG_TEST_CONFIRM,
      dateMode: process.env.SICREDI_MULTIPAG_EXAMPLE_DATE_MODE || "documentacao",
    }, { onProgress: (event) => console.log("[sicredi-multipag-pix] Etapa:", event) });
    console.log("[sicredi-multipag-pix]", result);
    console.log("[sicredi-multipag-pix] Resposta do contrato estatico; nao comprova liquidacao real nem o repasse TESTE-REPASSE-20260929-01.");
    return;
  }
  if (example) {
    const { transactionId: exampleId, ...payer } = MULTIPAG_SANDBOX_EXAMPLE;
    Object.assign(config, payer);
    mode = "consultar";
    transactionId = exampleId;
    console.log("[sicredi-multipag-pix] Consulta do exemplo publico do Sicredi (0910F3HT1). Nenhum POST de pagamento sera feito.");
  }
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
  }, { onProgress: (event) => console.log("[sicredi-multipag-pix] Etapa:", event) });
  console.log("[sicredi-multipag-pix]", result);
  if (result.action === "solicitacao_enviada") {
    console.log("[sicredi-multipag-pix] Solicitacao criada nao significa Pix liquidado. Consulte o mesmo ID; nao repita o envio.");
  }
}

main().catch((error) => {
  console.error(`[sicredi-multipag-pix] ${error.message}`);
  console.error("[sicredi-multipag-pix] Diagnostico:", {
    stage: error.testStage,
    providerStage: error.providerStage,
    method: error.providerMethod,
    path: error.providerPath,
    status: error.providerStatusCode,
    response: error.providerResponseInfo,
    details: error.providerDiagnostics,
  });
  if (error.testStage === "consulta_previa") {
    console.error("[sicredi-multipag-pix] Interrompido na consulta previa; este processo NAO chamou o POST de pagamento.");
  } else if (error.providerStateUnknown && error.testStage === "criacao") {
    console.error("[sicredi-multipag-pix] Estado desconhecido: consulte o MESMO idTransacao antes de qualquer nova tentativa.");
  }
  process.exitCode = 1;
});
