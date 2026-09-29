import { createPrivateKey, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import https from "node:https";
import { AppError } from "../../../utils/errors.js";

const MAX_RESPONSE_BYTES = 1_048_576;

export function decodeSicrediResponse(raw, statusCode, contentType = "") {
  let data = null;
  let format = raw ? "text" : "empty";
  try { if (raw) { data = JSON.parse(raw); format = "json"; } } catch { /* texto do gateway */ }
  return {
    data, statusCode,
    responseInfo: { format, bytes: Buffer.byteLength(raw), contentType: String(contentType).replace(/[\r\n]/g, "").slice(0, 120) },
    // Preservar texto apenas em falhas; sanitizado antes de entrar no erro/log.
    errorText: statusCode >= 400 && format === "text" ? raw.slice(0, 4000) : undefined,
  };
}

function required(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new AppError(`${name} nao configurado para o Sicredi`, 503);
  return result;
}

function certificateBlocks(value) {
  return value.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
}

export async function readSicrediMtls({ certPath, chainPath, keyPath, passphrase }) {
  const [certificate, key] = await Promise.all([
    readFile(required(certPath, "Certificado")),
    readFile(required(keyPath, "Chave privada")),
  ]);
  let leaf;
  let privateKey;
  try {
    leaf = new X509Certificate(certificate);
    privateKey = createPrivateKey({ key, passphrase: passphrase || undefined });
  } catch {
    throw new AppError("Certificado ou chave Sicredi invalido", 503);
  }
  if (!leaf.checkPrivateKey(privateKey)) {
    throw new AppError("Certificado Sicredi nao corresponde a chave privada", 503);
  }

  let chain = "";
  if (chainPath) {
    const blocks = certificateBlocks(await readFile(chainPath, "utf8"));
    if (!blocks.length) throw new AppError("Cadeia Sicredi invalida", 503);
    try {
      for (const block of blocks) new X509Certificate(block);
    } catch {
      throw new AppError("Cadeia Sicredi invalida", 503);
    }
    chain = `\n${blocks.join("\n")}`;
  }

  const leafPem = certificateBlocks(certificate.toString("utf8"))[0] ?? leaf.toString().trim();
  return new https.Agent({
    cert: `${leafPem}${chain}\n`,
    keepAlive: true,
    key,
    passphrase: passphrase || undefined,
  });
}

export function sicrediHttpRequest(url, { agent, body, headers = {}, method = "GET", timeoutMs = 15_000 }) {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new AppError("URL Sicredi precisa usar HTTPS", 503);
  const payload = body == null ? null : Buffer.from(body);

  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      agent,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Length": payload.length } : {}),
        ...headers,
      },
      method,
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("Resposta Sicredi maior que o limite permitido"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(decodeSicrediResponse(raw, response.statusCode ?? 0, response.headers["content-type"]));
      });
    });
    request.on("error", () => {
      const error = new AppError("Nao foi possivel confirmar a resposta do Sicredi", 502);
      error.providerStateUnknown = true;
      reject(error);
    });
    request.on("timeout", () => request.destroy(new Error("Timeout Sicredi")));
    request.end(payload ?? undefined);
  });
}

export function sicrediErrorDiagnostics(data, sensitiveValues = []) {
  const secrets = sensitiveValues.filter((value) => typeof value === "string" && value.length)
    .flatMap((value) => [value, encodeURIComponent(value)]).sort((a, b) => b.length - a.length);
  function clean(value) {
    let text = String(value);
    for (const secret of secrets) text = text.split(secret).join("[oculto]");
    return text
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[chave privada oculta]")
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, "$1 [oculto]")
      .replace(/\beyJ[A-Za-z0-9_.-]+/g, "[oculto]")
      .replace(/((?:client_secret|client_id|access_token|refresh_token|authorization)["']?\s*[=:]\s*)["']?[^\s,;"'<>]+["']?/gi, "$1[oculto]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email oculto]")
      .replace(/\d[\d. /()+-]{9,}\d/g, "[numero oculto]")
      .replace(/<[^>]*>/g, " ")
      .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 400);
  }
  const entries = [];
  const scalarFields = new Set(["response", "code", "codigo", "error", "message", "mensagem", "error_description", "detail", "title", "description", "descricao", "defaultMessage", "field", "campo", "reason", "motivo", "errorMessage", "mensagemErro", "codigoErro", "mensagens", "messages", "erros", "errors", "details", "errorCode"]);
  function visit(node, depth = 0, field = "response") {
    if (node == null || depth > 6 || entries.length >= 10) return;
    if (typeof node === "string" || typeof node === "number") {
      if (depth === 0 || scalarFields.has(field)) entries.push({ field, value: clean(node) });
      return;
    }
    if (Array.isArray(node)) { node.slice(0, 10).forEach((item) => visit(item, depth + 1, field)); return; }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node).slice(0, 30)) {
      // Jamais percorrer eco de requisicao, tokens ou valores rejeitados.
      if (/secret|token|authorization|password|senha|certificate|private|request|headers|payload|rejectedValue|invalidValue/i.test(key)) continue;
      visit(value, depth + 1, key);
    }
  }
  visit(data);
  return entries.slice(0, 10);
}

export function assertSicrediSuccess(result, operation, { sensitiveValues, method, path, stage } = {}) {
  if (result.statusCode >= 200 && result.statusCode < 300) return result.data;
  const error = new AppError(`Sicredi recusou ${operation} (HTTP ${result.statusCode})`, 502);
  error.providerStatusCode = result.statusCode;
  error.providerRejected = result.statusCode >= 400 && result.statusCode < 500 && result.statusCode !== 429;
  error.providerStateUnknown = result.statusCode === 429 || result.statusCode >= 500;
  error.providerDiagnostics = sicrediErrorDiagnostics(result.data, sensitiveValues);
  if (!error.providerDiagnostics.length && result.errorText) {
    error.providerDiagnostics = sicrediErrorDiagnostics(result.errorText, sensitiveValues);
  }
  error.providerResponseInfo = result.responseInfo;
  error.providerMethod = method;
  error.providerPath = path;
  error.providerStage = stage;
  throw error;
}
