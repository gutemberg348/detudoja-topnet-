import { AppError } from "../../../utils/errors.js";
import { assertSicrediSuccess, readSicrediMtls, sicrediHttpRequest } from "./sicredi.transport.js";

function requireHttpsUrl(raw, label) {
  let url;
  try { url = new URL(String(raw ?? "")); } catch { throw new AppError(`${label} nao configurada`, 503); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AppError(`${label} precisa ser HTTPS sem credenciais na URL`, 503);
  }
  return url;
}

export function createSicrediOAuthClient(config, { httpRequest = sicrediHttpRequest, mtlsLoader = readSicrediMtls } = {}) {
  let agentPromise;
  let token = null;
  let tokenExpiresAt = 0;
  let tokenPromise;

  function agent() {
    agentPromise ??= mtlsLoader(config.mtls).catch((error) => {
      agentPromise = null;
      throw error;
    });
    return agentPromise;
  }

  async function acquireToken() {
    const clientId = String(config.clientId ?? "").trim();
    const clientSecret = String(config.clientSecret ?? "").trim();
    if (!clientId || !clientSecret) throw new AppError("Credenciais Sicredi nao configuradas", 503);
    const url = requireHttpsUrl(config.tokenUrl, "URL de autenticacao Sicredi");
    const scope = String(config.scope ?? "").trim();
    if (!scope) throw new AppError("Escopo Sicredi nao configurado", 503);
    const style = config.tokenStyle;
    const form = new URLSearchParams({ grant_type: "client_credentials", scope });
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (style === "basic") {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else if (style === "body") {
      form.set("client_id", clientId);
      form.set("client_secret", clientSecret);
    } else {
      throw new AppError("Estilo OAuth Sicredi invalido", 503);
    }

    const result = await httpRequest(url, {
      agent: await agent(),
      body: form.toString(),
      headers,
      method: "POST",
    });
    const data = assertSicrediSuccess(result, "a autenticacao", {
      sensitiveValues: [clientId, clientSecret, Buffer.from(`${clientId}:${clientSecret}`).toString("base64")],
      method: "POST", path: url.pathname, stage: "autenticacao",
    });
    if (!data?.access_token || !Number.isFinite(Number(data.expires_in))) {
      throw new AppError("Resposta de autenticacao Sicredi incompleta", 502);
    }
    token = data.access_token;
    tokenExpiresAt = Date.now() + Math.max(0, Number(data.expires_in) - 30) * 1_000;
    return token;
  }

  async function accessToken() {
    if (token && tokenExpiresAt > Date.now()) return token;
    tokenPromise ??= acquireToken().finally(() => { tokenPromise = null; });
    return tokenPromise;
  }

  async function request(path, { body, headers = {}, method = "GET" } = {}) {
    const base = requireHttpsUrl(config.apiUrl, "URL da API Sicredi");
    if (!path.startsWith("/") || path.startsWith("//")) throw new AppError("Caminho Sicredi invalido", 500);
    const endpoint = new URL(`${base.pathname.replace(/\/$/, "")}${path}`, base.origin);
    const send = async () => httpRequest(endpoint, {
      agent: await agent(),
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      method,
    });
    let result = await send();
    if (result.statusCode === 401 && method === "GET") {
      token = null;
      tokenExpiresAt = 0;
      result = await send();
    }
    const values = (value) => value && typeof value === "object"
      ? Object.values(value).flatMap(values) : typeof value === "string" ? [value] : [];
    return assertSicrediSuccess(result, "a operacao", {
      sensitiveValues: [config.clientId, config.clientSecret, token,
        Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
        ...values(body), ...values(headers)],
      method, path: endpoint.pathname, stage: "operacao",
    });
  }

  return { accessToken, request };
}
