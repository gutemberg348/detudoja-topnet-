import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { googleConfigurationError, googleErrorMessage } from "../src/utils/google-auth.js";

// Before npm install on EAS: use only Node and project code, never local fallback credentials.
if (process.env.EAS_BUILD !== "true") {
  try {
    loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const platformIndex = process.argv.indexOf("--platform");
const platform = platformIndex >= 0
  ? process.argv[platformIndex + 1]
  : process.env.EAS_BUILD_PLATFORM || "android";

if (!["android", "ios", "web"].includes(platform)) {
  console.error("[google-auth] Plataforma invalida. Use --platform android, ios ou web.");
  process.exitCode = 1;
} else {
  const code = googleConfigurationError({
    platform,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim(),
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim(),
  });
  if (code) {
    console.error(`[google-auth] ${code}: ${googleErrorMessage({ code })}`);
    console.error("[google-auth] Configure a variavel no ambiente EAS usado pelo perfil de build. Consulte docs/login-google.md.");
    process.exitCode = 1;
  } else {
    console.log(`[google-auth] ${platform}: configuracao OAuth presente. Valores nao exibidos.`);
    console.log("[google-auth] A autorizacao do pacote/SHA-1 no Google Cloud e o login no aparelho ainda precisam ser conferidos.");
  }
}
