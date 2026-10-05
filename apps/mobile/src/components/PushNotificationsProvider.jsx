import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { registerDeviceForPushNotifications, resumePushRegistration, subscribePushTokenChanges } from "../services/push-notifications";
import { sendPushTest } from "../services/notifications.api";
import { useAuthStore } from "../stores/useAuthStore";
import { useFeedback } from "./FeedbackProvider";

const PushContext = createContext(null);

export function PushNotificationsProvider({ children }) {
  const { session } = useAuthStore();
  const { notify } = useFeedback();
  const current = useRef(session);
  current.current = session;
  const [readiness, setReadiness] = useState({ status: "idle" });
  const [testing, setTesting] = useState(false);
  const synchronize = useRef(async () => {});

  useEffect(() => {
    const userId = session?.user?.id;
    let active = true, running = false, timer, attempts = 0;
    const isCurrent = () => active && current.current?.user?.id === userId;
    setReadiness({ status: "idle" });
    if (!userId) { synchronize.current = async () => {}; return undefined; }
    resumePushRegistration();
    const sync = async (requestPermission = false) => {
      if (!isCurrent() || running || AppState.currentState !== "active") return;
      running = true;
      clearTimeout(timer);
      setReadiness(previous => ({ ...previous, status: "registering" }));
      try {
        const result = await registerDeviceForPushNotifications(current.current.accessToken, { requestPermission, isCurrent });
        if (isCurrent()) { attempts = 0; setReadiness(result); }
      } catch {
        if (isCurrent()) {
          setReadiness({ status: "error" });
          if (attempts < 3) timer = setTimeout(() => sync(false), [2_000, 8_000, 30_000][attempts++]);
        }
      } finally { running = false; }
    };
    synchronize.current = sync;
    // Permission prompts belong to the explicit Activate button.
    void sync(false);
    const state = AppState.addEventListener("change", value => { if (value === "active") void sync(false); });
    const token = subscribePushTokenChanges(() => { void sync(false); });
    return () => { active = false; clearTimeout(timer); state.remove(); token.remove(); };
  }, [session?.user?.id]);

  const activate = useCallback(async () => {
    try {
      if (readiness.status === "quiet" || (readiness.status === "denied" && !readiness.canAskAgain)) await Linking.openSettings();
      else await synchronize.current(true);
    } catch { notify("Não foi possível abrir os ajustes", "Confira as permissões de notificação nos ajustes do celular.", "error"); }
  }, [notify, readiness.status, readiness.canAskAgain]);
  const test = useCallback(async () => {
    if (!current.current?.accessToken || !readiness.token || testing) return;
    setTesting(true);
    try {
      await sendPushTest(current.current.accessToken, readiness.token);
      notify("Aviso de teste solicitado", "Confira a notificação neste aparelho. O teste só está confirmado quando ela aparecer.", "info");
    } catch (error) { notify("Não conseguimos enviar o teste", error.message || "Tente novamente em instantes.", "error"); }
    finally { setTesting(false); }
  }, [notify, readiness.token, testing]);
  return <PushContext.Provider value={{ ...readiness, activate, refresh: () => synchronize.current(false), test, testing }}>{children}</PushContext.Provider>;
}

export function usePushNotifications() { return useContext(PushContext); }
