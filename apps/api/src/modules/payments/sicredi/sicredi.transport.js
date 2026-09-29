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

export function assertSicrediSuccess(result, operation) {
  if (result.statusCode >= 200 && result.statusCode < 300) return result.data;
  const error = new AppError(`Sicredi recusou ${operation} (HTTP ${result.statusCode})`, 502);
  error.providerStatusCode = result.statusCode;
  error.providerRejected = result.statusCode >= 400 && result.statusCode < 500 && result.statusCode !== 429;
  error.providerStateUnknown = result.statusCode === 429 || result.statusCode >= 500;
  throw error;
}
