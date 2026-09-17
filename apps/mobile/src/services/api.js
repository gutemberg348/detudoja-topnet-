import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import { NativeModules, Platform } from "react-native";

function hostnameFromValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const normalizedValue = value.includes("://") ? value : `http://${value}`;
    return new URL(normalizedValue).hostname || null;
  } catch {
    return null;
  }
}

function resolveDevelopmentHost() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.hostname || null;
  }

  const nativeScriptUrl = NativeModules?.SourceCode?.scriptURL;
  const manifest2 = Constants.manifest2;
  const manifest = Constants.manifest;
  const candidates = [
    Constants.expoGoConfig?.debuggerHost,
    Constants.expoConfig?.hostUri,
    manifest2?.extra?.expoGo?.debuggerHost,
    manifest2?.extra?.expoClient?.hostUri,
    manifest?.debuggerHost,
    nativeScriptUrl,
  ];

  for (const candidate of candidates) {
    const hostname = hostnameFromValue(candidate);

    if (hostname) {
      return hostname;
    }
  }

  return null;
}

function resolveApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "");

  if (configuredUrl) {
    return configuredUrl;
  }

  const developmentHost = resolveDevelopmentHost();

  if (developmentHost) {
    return `http://${developmentHost}:3333`;
  }

  return Platform.select({
    android: "http://10.0.2.2:3333",
    default: "http://localhost:3333",
  });
}

export const apiBaseUrl = resolveApiBaseUrl();

let accessTokenRefresher = null;

export function configureAccessTokenRefresher(refresher) {
  accessTokenRefresher = refresher;

  return () => {
    if (accessTokenRefresher === refresher) {
      accessTokenRefresher = null;
    }
  };
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(
  path,
  options = {},
  canRetryAfterRefresh = true,
) {
  const { body, headers: customHeaders, method = "GET", timeoutMs, token } = options;
  const headers = {};
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  let requestToken = token;

  if (requestToken && accessTokenRefresher) {
    const resolvedToken = await accessTokenRefresher(requestToken, { force: false })
      .catch(() => null);

    if (resolvedToken) {
      requestToken = resolvedToken;
    }
  }

  if (body && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (requestToken) {
    headers.Authorization = `Bearer ${requestToken}`;
  }

  Object.assign(headers, customHeaders ?? {});

  let response;
  const effectiveTimeoutMs = timeoutMs ?? (isFormData ? 120_000 : undefined);
  const controller = effectiveTimeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), effectiveTimeoutMs) : null;
  const requestFetch = isFormData && Platform.OS !== "web" ? expoFetch : globalThis.fetch;

  try {
    response = await requestFetch(`${apiBaseUrl}${path}`, {
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
      headers,
      method,
      signal: controller?.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("O envio demorou mais que o esperado. Confira sua conexão e tente novamente.", 0, null);
    }
    throw new ApiError(
      isFormData
        ? "Não foi possível enviar o arquivo. Confira sua conexão e tente novamente."
        : "Não foi possível conectar à API.",
      0,
      null,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (
    response.status === 401
    && requestToken
    && canRetryAfterRefresh
    && accessTokenRefresher
  ) {
    const refreshedAccessToken = await accessTokenRefresher(
      requestToken,
      { force: true },
    ).catch(() => null);

    if (refreshedAccessToken && refreshedAccessToken !== requestToken) {
      return apiRequest(
        path,
        { ...options, token: refreshedAccessToken },
        false,
      );
    }
  }

  if (!response.ok) {
    const fallbackMessage = response.status === 413
      ? "O arquivo ficou grande demais para o servidor. Escolha outro arquivo e tente novamente."
      : response.status === 408 || response.status === 504
        ? "O servidor demorou para receber o arquivo. Confira sua conexao e tente novamente."
        : "A solicitacao nao pode ser concluida.";
    throw new ApiError(
      data?.message ?? fallbackMessage,
      response.status,
      data,
    );
  }

  return data;
}
