import { createPrivateKey, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import https from "node:https";
import { AppError } from "../../../utils/errors.js";

const MAX_RESPONSE_BYTES = 1_048_576;

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
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
        resolve({ data, statusCode: response.statusCode ?? 0 });
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
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, "$1 [oculto]")
      .replace(/\beyJ[A-Za-z0-9_.-]+/g, "[oculto]")
      .replace(/((?:client_secret|access_token|refresh_token|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[oculto]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email oculto]")
      .replace(/\d[\d. /()+-]{9,}\d/g, "[numero oculto]")
      .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 400);
  }
  const entries = [];
  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 2) return;
    if (Array.isArray(node)) { node.slice(0, 5).forEach((item) => visit(item, depth + 1)); return; }
    for (const field of ["code", "codigo", "error", "message", "mensagem", "error_description", "detail", "title"]) {
      if (typeof node[field] === "string" || typeof node[field] === "number") {
        entries.push({ field, value: clean(node[field]) });
      }
    }
    for (const field of ["error", "errors", "erros", "details"]) visit(node[field], depth + 1);
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
  error.providerMethod = method;
  error.providerPath = path;
  error.providerStage = stage;
  throw error;
}
