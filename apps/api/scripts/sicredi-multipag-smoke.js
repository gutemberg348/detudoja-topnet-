import "dotenv/config";
import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const sandboxTokenUrl = "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token";
const readOnlyScopes = [
  "multipag.boleto.consultar",
  "multipag.tributos.consultar",
  "multipag.pix.consultar",
].join(" ");

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

function absolutePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

async function loadMtlsCredentials() {
  const pfxPath = String(process.env.SICREDI_MULTIPAG_PFX_PATH ?? "").trim();
  if (pfxPath) {
    return {
      passphrase: process.env.SICREDI_MULTIPAG_CERT_PASSPHRASE || undefined,
      pfx: await readFile(absolutePath(pfxPath)),
    };
  }

  const certificate = await readFile(absolutePath(required("SICREDI_MULTIPAG_CERT_PATH")));
  const privateKey = await readFile(absolutePath(required("SICREDI_MULTIPAG_KEY_PATH")));
  if (!certificate.toString("utf8").includes("BEGIN CERTIFICATE")) {
    throw new Error(
      "O certificado parece estar em DER. Converta para PEM: openssl x509 -inform der -in certificado.cer -out certificado.pem",
    );
  }
  return {
    cert: certificate,
    key: privateKey,
    passphrase: process.env.SICREDI_MULTIPAG_CERT_PASSPHRASE || undefined,
  };
}

function requestToken({ clientId, clientSecret, mtls }) {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: readOnlyScopes,
  }).toString();

  return new Promise((resolve, reject) => {
    const request = https.request(sandboxTokenUrl, {
      ...mtls,
      headers: {
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(form),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "detudoja-sicredi-multipag-smoke/1.0",
      },
      method: "POST",
      timeout: 15_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let payload;
        try { payload = body ? JSON.parse(body) : {}; } catch { payload = { raw: body.slice(0, 500) }; }
        resolve({ payload, statusCode: response.statusCode ?? 0 });
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("Timeout ao conectar no sandbox Sicredi")));
    request.end(form);
  });
}

async function main() {
  const clientId = required("SICREDI_MULTIPAG_CLIENT_ID");
  const clientSecret = required("SICREDI_MULTIPAG_CLIENT_SECRET");
  const mtls = await loadMtlsCredentials();
  const result = await requestToken({ clientId, clientSecret, mtls });

  if (result.statusCode < 200 || result.statusCode >= 300 || !result.payload.access_token) {
    console.error("[sicredi-multipag] Falha no sandbox.", {
      error: result.payload.error ?? result.payload.message ?? result.payload.raw ?? "Resposta sem access_token",
      statusCode: result.statusCode,
    });
    process.exitCode = 1;
    return;
  }

  console.log("[sicredi-multipag] Sandbox autenticado com sucesso.", {
    expiresIn: result.payload.expires_in ?? null,
    scope: result.payload.scope ?? readOnlyScopes,
    tokenType: result.payload.token_type ?? "Bearer",
  });
}

main().catch((error) => {
  console.error(`[sicredi-multipag] ${error.message}`);
  process.exitCode = 1;
});
