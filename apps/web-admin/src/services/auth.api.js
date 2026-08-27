import { ApiError, apiGet, apiRequest } from "./api";

export function loginAdmin(credentials) {
  return apiRequest("/api/admin/auth/login", {
    body: credentials,
    method: "POST",
  });
}

export function getAdminMe(accessToken) {
  return apiGet("/api/admin/auth/me", accessToken);
}

export function refreshAdminSession(refreshToken) {
  return apiRequest("/api/admin/auth/refresh", {
    body: { refreshToken },
    method: "POST",
  });
}

export function logoutAdmin(accessToken, refreshToken) {
  return apiRequest("/api/admin/auth/logout", {
    body: { refreshToken },
    method: "POST",
    token: accessToken,
  });
}

export async function restoreAdminSession(session) {
  try {
    const { user } = await getAdminMe(session.accessToken);
    return { ...session, user };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const refreshedSession = await refreshAdminSession(session.refreshToken);
    const { user } = await getAdminMe(refreshedSession.accessToken);

    return { ...refreshedSession, user };
  }
}
