import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { ApiError, configureAccessTokenRefresher } from "../services/api";
import {
  completeAppCpf,
  getAppMe,
  loginApp,
  loginWithSocialApp,
  logoutApp,
  registerApp,
  refreshAppSession,
} from "../services/auth.api";
import { disconnectRealtimeSocket } from "../services/realtime";
import { unregisterExpoPushToken } from "../services/notifications.api";

const accessTokenKey = "detudoja.mobile.accessToken";
const refreshTokenKey = "detudoja.mobile.refreshToken";
const sessionUserKey = "detudoja.mobile.sessionUser";
const AuthContext = createContext(null);

async function getStorageItem(key) {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

async function setStorageItem(key, value) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function deleteStorageItem(key) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

async function persistTokens(session) {
  const operations = [
    setStorageItem(accessTokenKey, session.accessToken),
    setStorageItem(refreshTokenKey, session.refreshToken),
  ];

  if (session.user) {
    operations.push(setStorageItem(sessionUserKey, JSON.stringify(session.user)));
  }

  await Promise.all(operations);
}

async function clearTokens() {
  await Promise.all([
    deleteStorageItem(accessTokenKey),
    deleteStorageItem(refreshTokenKey),
    deleteStorageItem(sessionUserKey),
  ]);
}

function parseStoredUser(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function isAuthenticationFailure(error) {
  return error instanceof ApiError && [401, 403].includes(error.status);
}

function decodeBase64Url(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let bits = 0;
  let buffer = 0;
  let output = "";

  for (const character of normalized) {
    const index = alphabet.indexOf(character);

    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

function tokenExpiresSoon(token, thresholdSeconds = 60) {
  try {
    const payloadPart = String(token).split(".")[1];

    if (!payloadPart) {
      return true;
    }

    const expiresAtMatch = decodeBase64Url(payloadPart).match(/"exp"\s*:\s*(\d+)/);
    const expiresAt = Number(expiresAtMatch?.[1] ?? 0);

    return !expiresAt || expiresAt <= Math.floor(Date.now() / 1000) + thresholdSeconds;
  } catch {
    return true;
  }
}

export function AuthStoreProvider({ children }) {
  const [isRestoring, setIsRestoring] = useState(true);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const refreshPromiseRef = useRef(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshAccessToken = useCallback(async (
    failedAccessToken,
    { force = true } = {},
  ) => {
    const currentSession = sessionRef.current;

    if (!currentSession?.refreshToken) {
      return null;
    }

    // Outra requisicao pode ter renovado a sessao enquanto esta falhava.
    if (currentSession.accessToken !== failedAccessToken) {
      return currentSession.accessToken;
    }

    if (!force && !tokenExpiresSoon(currentSession.accessToken)) {
      return currentSession.accessToken;
    }

    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        try {
          const nextSession = await refreshAppSession(currentSession.refreshToken);
          await persistTokens(nextSession);
          sessionRef.current = nextSession;
          disconnectRealtimeSocket();
          setSession(nextSession);
          return nextSession.accessToken;
        } catch (error) {
          if (isAuthenticationFailure(error)) {
            disconnectRealtimeSocket();
            await clearTokens();
            sessionRef.current = null;
            setSession(null);
          }

          throw error;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();
    }

    try {
      return await refreshPromiseRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(
    () => configureAccessTokenRefresher(refreshAccessToken),
    [refreshAccessToken],
  );

  useEffect(() => {
    let active = true;

    async function restore() {
      const [accessToken, refreshToken, storedUserValue] = await Promise.all([
        getStorageItem(accessTokenKey),
        getStorageItem(refreshTokenKey),
        getStorageItem(sessionUserKey),
      ]);
      const storedUser = parseStoredUser(storedUserValue);

      if (!accessToken || !refreshToken) {
        return;
      }

      try {
        const { user } = await getAppMe(accessToken);

        if (active) {
          sessionRef.current = { accessToken, refreshToken, user };
          setSession({ accessToken, refreshToken, user });
        }
      } catch (error) {
        if (!isAuthenticationFailure(error)) {
          // Uma falha temporaria da API nunca deve derrubar a sessao local.
          if (active) {
            sessionRef.current = { accessToken, refreshToken, user: storedUser ?? {} };
            setSession({ accessToken, refreshToken, user: storedUser ?? {} });
          }
          return;
        }

        try {
          const refreshedSession = await refreshAppSession(refreshToken);
          await persistTokens(refreshedSession);

          if (active) {
            sessionRef.current = refreshedSession;
            setSession(refreshedSession);
          }
        } catch (refreshError) {
          if (isAuthenticationFailure(refreshError)) {
            disconnectRealtimeSocket();
            await clearTokens();
            return;
          }

          if (active) {
            sessionRef.current = { accessToken, refreshToken, user: storedUser ?? {} };
            setSession({ accessToken, refreshToken, user: storedUser ?? {} });
          }
        }
      }
    }

    restore().finally(() => {
      if (active) {
        setIsRestoring(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function login(credentials) {
    const nextSession = await loginApp(credentials);
    await persistTokens(nextSession);
    sessionRef.current = nextSession;
    setSession(nextSession);
  }

  async function socialLogin(data) {
    const nextSession = await loginWithSocialApp(data);
    await persistTokens(nextSession);
    sessionRef.current = nextSession;
    setSession(nextSession);
  }

  async function register(data) {
    const nextSession = await registerApp(data);
    await persistTokens(nextSession);
    sessionRef.current = nextSession;
    setSession(nextSession);
  }

  async function completeCpf(cpf) {
    if (!session?.accessToken) return;
    const response = await completeAppCpf(session.accessToken, cpf);
    const nextSession = {
      ...session,
      user: { ...session.user, ...response.user },
    };
    await persistTokens(nextSession);
    sessionRef.current = nextSession;
    setSession(nextSession);
  }

  async function logout() {
    try {
      if (session?.accessToken && session?.refreshToken) {
        const pushToken = await getStorageItem("detudoja.mobile.expoPushToken");
        if (pushToken) {
          await unregisterExpoPushToken(session.accessToken, pushToken).catch(() => {});
          await deleteStorageItem("detudoja.mobile.expoPushToken");
        }
        await logoutApp(session.accessToken, session.refreshToken);
      }
    } catch {
      // A sessão local sempre deve terminar, mesmo com a API indisponível.
    }

    disconnectRealtimeSocket();
    await clearTokens();
    sessionRef.current = null;
    setSession(null);
  }

  function updateSessionUser(user) {
    setSession((currentSession) => {
      if (!currentSession) return currentSession;

      const nextSession = {
        ...currentSession,
        user: { ...currentSession.user, ...user },
      };
      sessionRef.current = nextSession;
      persistTokens(nextSession).catch(() => {});
      return nextSession;
    });
  }

  const value = useMemo(
    () => ({
      isRestoring,
      completeCpf,
      login,
      logout,
      register,
      session,
      socialLogin,
      updateSessionUser,
    }),
    [isRestoring, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthStore() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthStore must be used inside AuthStoreProvider");
  }

  return context;
}
