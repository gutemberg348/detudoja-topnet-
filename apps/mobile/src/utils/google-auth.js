export function googleConfigurationError({ platform, webClientId, iosClientId }) {
  const validId = (value) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(value ?? "");
  if (!validId(webClientId)) return "GOOGLE_WEB_CLIENT_MISSING";
  if (platform === "ios" && (!validId(iosClientId) || iosClientId === webClientId)) {
    return "GOOGLE_IOS_CLIENT_MISSING";
  }
  return null;
}

export async function performNativeGoogleLogin({ googleSignin, platform, webClientId, iosClientId }) {
  const code = googleConfigurationError({ platform, webClientId, iosClientId });
  if (code) throw Object.assign(new Error(code), { code });
  googleSignin.configure({
    webClientId,
    ...(platform === "ios" ? { iosClientId } : {}),
    offlineAccess: false,
  });
  if (platform === "android") {
    const available = await googleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (!available) throw Object.assign(new Error("Play Services unavailable"), { code: "PLAY_SERVICES_NOT_AVAILABLE" });
  }
  const response = await googleSignin.signIn();
  if (response?.type === "cancelled") return null;
  const idToken = response?.type === "success" ? response.data?.idToken : null;
  if (!idToken) throw Object.assign(new Error("Missing Google identity"), { code: "GOOGLE_TOKEN_MISSING" });
  return idToken;
}

export function googleErrorMessage(error) {
  const code = String(error?.code ?? "");
  if (["SIGN_IN_CANCELLED", "12501", "ERR_REQUEST_CANCELED"].includes(code)) return "";
  if (["10", "DEVELOPER_ERROR", "12500", "SIGN_IN_FAILED"].includes(code)) {
    return "Google nao autorizado para este APK. Confira o ID Web, o pacote e o SHA-1 da assinatura no Google Cloud.";
  }
  if (["PLAY_SERVICES_NOT_AVAILABLE", "-3"].includes(code)) {
    return "O Google Play Services esta ausente ou desatualizado. Atualize no celular e tente novamente.";
  }
  if (["IN_PROGRESS", "ASYNC_OP_IN_PROGRESS"].includes(code)) return "Ja existe um login Google em andamento. Aguarde e tente novamente.";
  if (code === "GOOGLE_WEB_CLIENT_MISSING") return "O ID OAuth Web do Google nao foi configurado neste app. Configure e gere um novo APK.";
  if (code === "GOOGLE_IOS_CLIENT_MISSING") return "Configure um ID OAuth iOS proprio, diferente do ID Web, e gere um novo app para iPhone.";
  if (code === "GOOGLE_BUILD_REQUIRED") return "Este app precisa de uma nova compilacao com o login Google nativo. Nao funciona no Expo Go.";
  if (code === "GOOGLE_EXPO_GO_UNSUPPORTED") return "Para entrar com Google, use o APK instalado ou um build de desenvolvimento. O Expo Go nao oferece esse recurso.";
  if (code === "GOOGLE_NATIVE_MODULE_MISSING") return "Esta versao do aplicativo nao inclui o login Google. Instale o APK atualizado e tente novamente.";
  if (code === "GOOGLE_TOKEN_MISSING") return "O Google nao retornou a identidade. Confira o ID OAuth Web e tente novamente.";
  if (code === "access_denied") return "Acesso Google nao autorizado. Confira os usuarios de teste e o publico do app no Google Cloud.";
  if (code === "redirect_uri_mismatch") return "A URL de retorno do login nao esta autorizada no cliente Web do Google.";
  return "Nao foi possivel entrar com Google. Confira a conexao e tente novamente.";
}
