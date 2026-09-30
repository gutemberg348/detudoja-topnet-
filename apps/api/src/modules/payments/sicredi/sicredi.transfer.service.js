import { assertSicrediEnvironment } from "../payment-gateway.js";
import { createSicrediMultipagClient, sicrediMultipagConfigFromEnv } from "./sicredi.multipag.client.js";
import { normalizeSicrediTransfer } from "./sicredi.validation.js";

let cachedClient;
function client() { return cachedClient ??= createSicrediMultipagClient(sicrediMultipagConfigFromEnv()); }
function paymentDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export async function createSicrediTransfer(record) {
  assertSicrediEnvironment(record, "transfer");
  // The caller has already claimed PROCESSANDO durably; reconciliation uses
  // referencia_externa even if POST never returns. No alternate provider here.
  const response = await client().createPixTransfer({
    amountCents: record.valor_liquido_centavos ?? record.valor_centavos,
    date: paymentDate(), description: `Brasil Cashback ${record.referencia_externa}`,
    destinationDocument: record.documento_titular, destinationKey: record.chave_pix_destino,
    destinationKeyType: record.tipo_chave_pix ?? record.tipo_chave,
    destinationName: record.nome_titular, transactionId: record.referencia_externa,
  });
  return normalizeSicrediTransfer(record, response);
}
export async function getSicrediTransfer(record) {
  assertSicrediEnvironment(record, "transfer");
  return normalizeSicrediTransfer(record, await client().getPixTransfer(record.referencia_externa));
}
