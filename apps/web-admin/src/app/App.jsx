import { useEffect, useState } from "react";
import { AppShell } from "./layout/AppShell";
import { LoginPage } from "../pages/LoginPage";
import {
  logoutAdmin,
  restoreAdminSession,
} from "../services/auth.api";
import { disconnectAdminRealtimeSocket } from "../services/realtime";
import {
  clearAuthSession,
  readAuthSession,
  saveAuthSession,
} from "../stores/auth.store";

export function App() {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let isActive = true;
    const storedSession = readAuthSession();

    if (!storedSession) {
      setStatus("anonymous");
      return undefined;
    }

    restoreAdminSession(storedSession)
      .then((restoredSession) => {
        if (!isActive) {
          return;
        }

        saveAuthSession(restoredSession);
        setSession(restoredSession);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        clearAuthSession();
        disconnectAdminRealtimeSocket();
        setStatus("anonymous");
      });

    return () => {
      isActive = false;
    };
  }, []);

  function handleAuthenticated(authSession) {
    saveAuthSession(authSession);
    setSession(authSession);
    setStatus("authenticated");
  }

  async function handleLogout() {
    try {
      await logoutAdmin(session.accessToken, session.refreshToken);
    } catch {
      // A sessão local deve ser encerrada mesmo se a API estiver indisponível.
    }

    clearAuthSession();
    disconnectAdminRealtimeSocket();
    setSession(null);
    setStatus("anonymous");
  }

  if (status === "checking") {
    return (
      <main className="loading-page">
        <p>Validando sessão...</p>
      </main>
    );
  }

  if (status === "anonymous") {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  return <AppShell onLogout={handleLogout} session={session} />;
}
