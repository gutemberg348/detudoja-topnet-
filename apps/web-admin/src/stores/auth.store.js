const sessionKey = "detudoja.admin.session";

export function clearAuthSession() {
  sessionStorage.removeItem(sessionKey);
}

export function readAuthSession() {
  const value = sessionStorage.getItem(sessionKey);

  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value);

    if (!session.accessToken || !session.refreshToken || !session.user) {
      clearAuthSession();
      return null;
    }

    return session;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function saveAuthSession(session) {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
}
