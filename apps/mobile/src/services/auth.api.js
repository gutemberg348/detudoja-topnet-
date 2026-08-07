import { apiRequest } from "./api";

export function loginApp(credentials) {
  return apiRequest("/api/app/auth/login", {
    body: credentials,
    method: "POST",
  });
}

export function registerApp(data) {
  return apiRequest("/api/app/auth/register", {
    body: data,
    method: "POST",
  });
}

export function completeAppCpf(accessToken, cpf) {
  return apiRequest("/api/app/auth/complete-cpf", {
    body: { cpf },
    method: "POST",
    token: accessToken,
  });
}

export function getAppMe(accessToken) {
  return apiRequest("/api/app/auth/me", { token: accessToken });
}

export function refreshAppSession(refreshToken) {
  return apiRequest("/api/app/auth/refresh", {
    body: { refreshToken },
    method: "POST",
  });
}

export function logoutApp(accessToken) {
  return apiRequest("/api/app/auth/logout", {
    method: "POST",
    token: accessToken,
  });
}
