import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createSicrediOAuthClient } from "../src/modules/payments/sicredi/sicredi.oauth.js";
import { readSicrediMtls, sicrediErrorDiagnostics } from "../src/modules/payments/sicredi/sicredi.transport.js";

// Published in Sicredi's 2022 integration guide, pp. 8-9. Deliberately fixed:
// this standalone probe must never follow the application's production URLs.
export const SANDBOX = Object.freeze({
  apiUrl: "https://api-pix-h.sicredi.com.br/api/v2",
  tokenUrl: "https://api-pix-h.sicredi.com.br/oauth/token",
});

export function testConfig(source = process.env) {
  const prefix = ["SICREDI_PIX_TEST", "SICREDI_PIX", "SICREDI_MULTIPAG"]
    .find((name) => source[`${name}_CLIENT_ID`]?.trim() || source[`${name}_CLIENT_SECRET`]?.trim());
  if (!prefix || !source[`${prefix}_CLIENT_ID`]?.trim() || !source[`${prefix}_CLIENT_SECRET`]?.trim()) {
    throw new Error("Configure um par completo CLIENT_ID/CLIENT_SECRET (SICREDI_PIX_TEST, SICREDI_PIX ou SICREDI_MULTIPAG). Pares nao sao misturados.");
  }
  if (prefix !== "SICREDI_PIX_TEST" && source[`${prefix}_ENV`] && source[`${prefix}_ENV`] !== "sandbox") {
    throw new Error(`As credenciais ${prefix} estao marcadas fora do sandbox. Use um par de teste separado.`);
  }
  return {
    ...SANDBOX,
    credentialSource: prefix,
    clientId: source[`${prefix}_CLIENT_ID`].trim(),
    clientSecret: source[`${prefix}_CLIENT_SECRET`].trim(),
    pixKey: (source.SICREDI_PIX_TEST_RECEIVING_KEY || source.SICREDI_PIX_RECEIVING_KEY || "").trim(),
    mtls: {
      certPath: source.SICREDI_PIX_TEST_CERT_PATH,
      keyPath: source.SICREDI_PIX_TEST_KEY_PATH,
      chainPath: source.SICREDI_PIX_TEST_CHAIN_PATH,
      passphrase: source.SICREDI_PIX_TEST_CERT_PASSPHRASE || source.SICREDI_PIX_CERT_PASSPHRASE || source.SICREDI_MULTIPAG_CERT_PASSPHRASE,
    },
  };
}

export function parseCommand(args) {
  const [mode = "diagnostico", value] = args;
  if (!new Set(["diagnostico", "autenticar", "criar", "consultar"]).has(mode)
    || args.length > 2 || (mode === "diagnostico" && value !== undefined)) {
    throw new Error("Uso: diagnostico | autenticar [cob.read|cob.write] | criar [TXID] | consultar TXID");
  }
  if (mode === "autenticar") {
    if (value && !["cob.read", "cob.write"].includes(value)) throw new Error("Escopo permitido: cob.read ou cob.write.");
    return { mode, scope: value || "cob.write" };
  }
  if (mode === "criar" || mode === "consultar") {
    const txid = value || (mode === "criar" ? `DTJTEST${randomBytes(12).toString("hex")}` : "");
    if (!/^DTJTEST[a-zA-Z0-9]{19,28}$/.test(txid)) {
      throw new Error("Use o TXID impresso pelo teste: prefixo DTJTEST e 26 a 35 caracteres alfanumericos.");
    }
    return { mode, txid };
  }
  return { mode };
}

export async function runSandbox(command, config, {
  oauthFactory = createSicrediOAuthClient,
  mtlsLoader = readSicrediMtls,
  log = console.log,
} = {}) {
  if (config.apiUrl !== SANDBOX.apiUrl || config.tokenUrl !== SANDBOX.tokenUrl) {
    throw new Error("Este teste aceita somente os endpoints fixos de homologacao da API Pix.");
  }
  // Validate programmatic callers as well as the CLI before loading a key/token.
  command = parseCommand([command.mode, command.txid || command.scope].filter((part) => part !== undefined));
  const { mode, txid } = command;
  log("[pix-sandbox] Configuracao", {
    mode, ...SANDBOX, credentialSource: config.credentialSource,
    receivingKeyConfigured: Boolean(config.pixKey),
  });
  if (txid) log("[pix-sandbox] TXID (guarde para consultar):", txid);
  if (mode === "criar" && (!config.pixKey || config.pixKey.length > 77)) {
    throw new Error("Defina SICREDI_PIX_TEST_RECEIVING_KEY no arquivo separado de teste. A chave de destino Multipag nao e usada como recebedora.");
  }
  let agent;
  let stage = "certificado";
  try {
    agent = await mtlsLoader(config.mtls);
    log("[pix-sandbox] Certificado e chave correspondem; cadeia carregada.");
    if (mode === "diagnostico") {
      log("[pix-sandbox] Diagnostico local concluido. Nenhuma chamada ao banco.");
      return;
    }
    const clients = new Map();
    function scoped(scope) {
      if (!clients.has(scope)) clients.set(scope, oauthFactory({ ...config, scope, tokenStyle: "basic" }, {
        mtlsLoader: async () => agent,
      }));
      return clients.get(scope);
    }
    if (mode === "autenticar") {
      stage = "autenticacao";
      await scoped(command.scope).accessToken();
      log("[pix-sandbox] OAuth/mTLS OK; token omitido; escopo solicitado:", command.scope);
      return;
    }
    stage = "consulta";
    let charge;
    try {
      charge = await scoped("cob.read").request(`/cob/${txid}`);
    } catch (error) {
      // A 404 from authentication must never authorize the PUT.
      if (mode !== "criar" || error.providerStatusCode !== 404 || error.providerStage !== "operacao") throw error;
      stage = "criacao";
      log("[pix-sandbox] Cobranca ausente. Criando R$ 1,00, expiracao de 1 hora.");
      charge = await scoped("cob.write").request(`/cob/${txid}`, {
        method: "PUT",
        body: {
          calendario: { expiracao: 3600 },
          chave: config.pixKey,
          solicitacaoPagador: "Teste isolado Pix sandbox",
          valor: { original: "1.00", modalidadeAlteracao: "0" },
        },
      });
    }
    if (!charge || charge.txid !== txid || typeof charge.status !== "string") {
      throw new Error("Resposta sem cobranca valida para o TXID solicitado. Consulte o mesmo TXID antes de tentar criar outra.");
    }
    log("[pix-sandbox] Cobranca", {
      txid: charge.txid, status: charge.status, valor: charge.valor?.original,
      resultado: stage === "criacao" ? "criada" : "consultada (nenhum PUT realizado)",
    });
    if (typeof charge.pixCopiaECola === "string" && charge.pixCopiaECola.length) {
      log("[pix-sandbox] Pix copia e cola retornado pelo banco:", charge.pixCopiaECola);
    } else {
      log("[pix-sandbox] Banco nao retornou pixCopiaECola. Consulte o mesmo TXID; nenhum QR foi inventado.");
    }
    return charge;
  } catch (error) {
    error.testStage = stage;
    error.testTxid = txid;
    throw error;
  } finally {
    agent?.destroy();
  }
}

export function errorSummary(error, config = {}) {
  return {
    stage: error.testStage, providerStage: error.providerStage,
    status: error.providerStatusCode, method: error.providerMethod,
    path: error.providerPath, txid: error.testTxid,
    message: sicrediErrorDiagnostics(error.message, [config.clientId, config.clientSecret, config.pixKey]),
    details: (error.providerDiagnostics ?? []).map((item) => ({
      field: item.field,
      messages: sicrediErrorDiagnostics(item.value, [config.clientId, config.clientSecret, config.pixKey]),
    })),
    response: error.providerResponseInfo,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let config;
  try {
    const command = parseCommand(process.argv.slice(2));
    config = testConfig();
    await runSandbox(command, config);
  } catch (error) {
    console.error("[pix-sandbox] Falha:", JSON.stringify(errorSummary(error, config), null, 2));
    if (error.testStage === "criacao") {
      console.error("[pix-sandbox] Consulte o MESMO TXID antes de outra tentativa. Nao ha repeticao automatica do PUT.");
    }
    process.exitCode = 1;
  }
}
