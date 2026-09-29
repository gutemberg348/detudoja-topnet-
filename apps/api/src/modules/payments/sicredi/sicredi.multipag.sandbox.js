import { AppError } from "../../../utils/errors.js";
import { createSicrediMultipagClient } from "./sicredi.multipag.client.js";

const SANDBOX_AUTH_URL = "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token";
const SANDBOX_API_URL = "https://mtls-api-parceiro.sicredi.com.br/sb/multipag-pagamento-sandbox";

// Dados publicos do Guia de Pagamentos Pix, nao dados da conta do aplicativo.
export const MULTIPAG_SANDBOX_EXAMPLE = Object.freeze({
  transactionId: "0910F3HT1", conta: "000001", cooperativa: "0100", documento: "11111111000111",
});

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

// Teste do contrato estatico: o GET do exemplo ja retorna SUCESSO antes do POST.
// Mantido separado do fluxo de repasses com consulta preventiva.
export async function runMultipagSandboxExample({ config, environment, confirmation }, {
  clientFactory = createSicrediMultipagClient, onProgress = () => {},
} = {}) {
  assertMultipagSandboxConfig(config, environment);
  if (confirmation !== "CONFIRMO_SANDBOX") throw new AppError("Exemplo exige CONFIRMO_SANDBOX", 400);
  const { transactionId, ...payer } = MULTIPAG_SANDBOX_EXAMPLE;
  const client = clientFactory({ ...config, ...payer, transferEnabled: true });
  onProgress({ stage: "criacao_exemplo_estatico", method: "POST", transactionId });
  try {
    const data = await client.createPixTransfer({
      transactionId, associatedPaymentId: "EMP:001", amountCents: 2010,
      date: "2026-08-14", description: "Pagamento ordem 001",
      destinationKeyType: "TELEFONE", destinationKey: "+5511999999999",
      destinationDocument: "11111111111",
    });
    return { action: "exemplo_estatico_enviado", data: multipagTransferSummary(data) };
  } catch (error) {
    error.testStage = "criacao_exemplo_estatico";
    throw error;
  }
}

export async function runMultipagSandboxTransfer({
  config,
  environment,
  mode,
  transactionId,
  transfer,
}, { clientFactory = createSicrediMultipagClient, onProgress = () => {} } = {}) {
  assertMultipagSandboxConfig(config, environment);
  if (mode !== "consultar" && mode !== "enviar") {
    throw new AppError("Acao invalida: use consultar ou enviar", 400);
  }
  if (!/^[a-zA-Z0-9:-]{1,100}$/.test(String(transactionId ?? ""))) {
    throw new AppError("Informe um idTransacao alfanumerico estavel (ate 100 caracteres)", 400);
  }

  const client = clientFactory({ ...config, transferEnabled: mode === "enviar" });
  async function lookup(stage) {
    onProgress({ stage, method: "GET", transactionId });
    try { return await client.getPixTransfer(transactionId); }
    catch (error) { error.testStage = stage; throw error; }
  }
  if (mode === "consultar") {
    const data = await lookup("consulta");
    return { action: "consultado", data: multipagTransferSummary(data) };
  }
  if (!transfer || transfer.transactionId !== transactionId) {
    throw new AppError("Dados do repasse ou idTransacao inconsistentes", 400);
  }

  // Um 404 permite a primeira tentativa. Qualquer outra falha e ambigua:
  // nao envie um novo Pix se a consulta nao pode confirmar a ausencia do ID.
  try {
    const existing = await lookup("consulta_previa");
    return { action: "ja_existia_nao_reenviado", data: multipagTransferSummary(existing) };
  } catch (error) {
    if (error.providerStatusCode !== 404 || error.providerStage === "autenticacao") throw error;
    onProgress({ stage: "consulta_previa_404", transactionId });
  }

  onProgress({ stage: "criacao", method: "POST", transactionId });
  let created;
  try { created = await client.createPixTransfer(transfer); }
  catch (error) { error.testStage = "criacao"; throw error; }
  return { action: "solicitacao_enviada", data: multipagTransferSummary(created) };
}
