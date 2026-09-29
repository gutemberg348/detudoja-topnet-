import { AppError } from "../../../utils/errors.js";
import { createSicrediMultipagClient } from "./sicredi.multipag.client.js";

const SANDBOX_AUTH_URL = "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token";
const SANDBOX_API_URL = "https://mtls-api-parceiro.sicredi.com.br/sb/multipag-pagamento-sandbox";

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

export function assertMultipagSandboxConfig(config, environment) {
  if (environment !== "sandbox"
    || normalizedUrl(config.tokenUrl) !== SANDBOX_AUTH_URL
    || normalizedUrl(config.apiUrl) !== SANDBOX_API_URL) {
    throw new AppError("Teste de repasse permitido somente nos endpoints oficiais do Sandbox Multipag", 400);
  }
}

export function multipagTransferSummary(data) {
  if (!data || typeof data !== "object") return { status: "SEM_RESPOSTA_JSON" };
  return {
    idTransacao: data.idTransacao ?? null,
    idPagamentoPix: data.idPagamentoPix ?? null,
    status: data.status ?? "NAO_INFORMADO",
    valorPagamento: data.valorPagamento ?? null,
  };
}

export async function runMultipagSandboxTransfer({
  config,
  environment,
  mode,
  transactionId,
  transfer,
}, { clientFactory = createSicrediMultipagClient } = {}) {
  assertMultipagSandboxConfig(config, environment);
  if (mode !== "consultar" && mode !== "enviar") {
    throw new AppError("Acao invalida: use consultar ou enviar", 400);
  }
  if (!/^[a-zA-Z0-9:-]{1,100}$/.test(String(transactionId ?? ""))) {
    throw new AppError("Informe um idTransacao alfanumerico estavel (ate 100 caracteres)", 400);
  }

  const client = clientFactory({ ...config, transferEnabled: mode === "enviar" });
  if (mode === "consultar") {
    const data = await client.getPixTransfer(transactionId);
    return { action: "consultado", data: multipagTransferSummary(data) };
  }
  if (!transfer || transfer.transactionId !== transactionId) {
    throw new AppError("Dados do repasse ou idTransacao inconsistentes", 400);
  }

  // Um 404 permite a primeira tentativa. Qualquer outra falha e ambigua:
  // nao envie um novo Pix se a consulta nao pode confirmar a ausencia do ID.
  try {
    const existing = await client.getPixTransfer(transactionId);
    return { action: "ja_existia_nao_reenviado", data: multipagTransferSummary(existing) };
  } catch (error) {
    if (error.providerStatusCode !== 404) throw error;
  }

  const created = await client.createPixTransfer(transfer);
  return { action: "solicitacao_enviada", data: multipagTransferSummary(created) };
}
