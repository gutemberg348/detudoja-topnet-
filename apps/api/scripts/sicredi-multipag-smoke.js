import "dotenv/config";
import { createPrivateKey, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const tokenUrls = {
  production: "https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token",
  sandbox: "https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token",
};
const tokenOnlyScopes = new Set([
  "multipag.boleto.consultar",
  "multipag.tributos.consultar",
  "multipag.pix.consultar",
  "multipag.pix.pagar",
]);

function environment() {
  const value = String(process.env.SICREDI_MULTIPAG_ENV ?? "sandbox").trim().toLowerCase();
  if (!Object.hasOwn(tokenUrls, value)) {
    throw new Error("SICREDI_MULTIPAG_ENV deve ser sandbox ou production");
  }
  return value;
}

function consultationScope() {
  const value = String(process.env.SICREDI_MULTIPAG_SCOPE ?? "multipag.pix.consultar").trim();
  const scopes = value.split(/\s+/);
  if (!scopes.length || scopes.some((scope) => !tokenOnlyScopes.has(scope))) {
    throw new Error("SICREDI_MULTIPAG_SCOPE contem escopo nao permitido neste teste de token");
  }
  return value;
}

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
  let parsedCertificate;
  let parsedKey;
  try {
    parsedCertificate = new X509Certificate(certificate);
    parsedKey = createPrivateKey({
      key: privateKey,
      passphrase: process.env.SICREDI_MULTIPAG_CERT_PASSPHRASE || undefined,
    });
  } catch {
    throw new Error("Nao foi possivel ler o certificado assinado ou a chave privada");
  }
  if (!parsedCertificate.checkPrivateKey(parsedKey)) {
    throw new Error("O certificado assinado nao corresponde a chave privada informada");
  }
  const chainPath = String(process.env.SICREDI_MULTIPAG_CHAIN_PATH ?? "").trim();
  let chain = "";
  if (chainPath) {
    const chainFile = await readFile(absolutePath(chainPath), "utf8");
    const certificates = chainFile.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length) {
      throw new Error("A cadeia Sicredi precisa conter certificados em formato PEM");
    }
    try {
      for (const item of certificates) new X509Certificate(item);
    } catch {
      throw new Error("A cadeia Sicredi contem um certificado invalido");
    }
    chain = `\n${certificates.join("\n")}\n`;
  }
  const leaf = certificate.includes(Buffer.from("-----BEGIN CERTIFICATE-----"))
    ? certificate.toString("utf8")
    : parsedCertificate.toString();
  return {
    cert: `${leaf.trimEnd()}${chain}`,
    key: privateKey,
    passphrase: process.env.SICREDI_MULTIPAG_CERT_PASSPHRASE || undefined,
  };
}

function requestToken({ clientId, clientSecret, mtls, scope, tokenUrl }) {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope,
  }).toString();

  return new Promise((resolve, reject) => {
    const request = https.request(tokenUrl, {
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
        try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
        resolve({ payload, statusCode: response.statusCode ?? 0 });
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("Timeout ao conectar no sandbox Sicredi")));
    request.end(form);
  });
}

async function main() {
  const targetEnvironment = environment();
  const scope = consultationScope();
  const clientId = required("SICREDI_MULTIPAG_CLIENT_ID");
  const clientSecret = required("SICREDI_MULTIPAG_CLIENT_SECRET");
  const mtls = await loadMtlsCredentials();
  const result = await requestToken({
    clientId,
    clientSecret,
    mtls,
    scope,
    tokenUrl: tokenUrls[targetEnvironment],
  });

  if (result.statusCode < 200 || result.statusCode >= 300 || !result.payload.access_token) {
    console.error("[sicredi-multipag] Falha na autenticacao.", {
      environment: targetEnvironment,
      error: typeof result.payload.error === "string"
        ? result.payload.error.slice(0, 80)
        : "Sem access_token; confira credenciais, escopo e certificado",
      statusCode: result.statusCode,
    });
    process.exitCode = 1;
    return;
  }

  const grantedScopes = String(result.payload.scope ?? "").split(/\s+/).filter(Boolean);
  if (scope === "multipag.pix.pagar" && !grantedScopes.includes(scope)) {
    console.error("[sicredi-multipag] Token recebido, mas o escopo de pagamento nao foi confirmado na resposta.", {
      environment: targetEnvironment,
      grantedScopes,
    });
    process.exitCode = 1;
    return;
  }

  console.log("[sicredi-multipag] Autenticacao mTLS concluida.", {
    environment: targetEnvironment,
    expiresIn: result.payload.expires_in ?? null,
    scope: result.payload.scope ?? null,
    tokenType: result.payload.token_type ?? "Bearer",
  });
}

main().catch((error) => {
  console.error(`[sicredi-multipag] ${error.message}`);
  process.exitCode = 1;
});
