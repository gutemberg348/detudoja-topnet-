import "dotenv/config";
import { createSicrediOAuthClient } from "../src/modules/payments/sicredi/sicredi.oauth.js";
import { sicrediPixConfigFromEnv } from "../src/modules/payments/sicredi/sicredi.pix.client.js";

const allowedScopes = new Set(["cob.read", "cob.write", "pix.read", "pix.write"]);

async function main() {
  const scope = String(process.env.SICREDI_PIX_SMOKE_SCOPE ?? "cob.read").trim();
  if (!allowedScopes.has(scope)) throw new Error("Escopo de teste Pix invalido");
  const client = createSicrediOAuthClient({
    ...sicrediPixConfigFromEnv(),
    scope,
    tokenStyle: "basic",
  });
  await client.accessToken();
  console.log("[sicredi-pix] Autenticacao OAuth2/mTLS concluida; nenhuma cobranca ou transferencia foi criada.", {
    scopeRequested: scope,
  });
}

main().catch((error) => {
  console.error(`[sicredi-pix] ${error.message}`);
  process.exitCode = 1;
});
