import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Vibration } from "react-native";
import { acceptCourierRequest, getCourierRequests, rejectCourierRequest } from "../services/courier.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import {
  acceptServiceConversation,
  cancelServiceConversation,
  getServiceConversations,
} from "../services/service-chats.api";
import { useAuthStore } from "../stores/useAuthStore";
import { IncomingServiceAlert } from "./IncomingServiceAlert";

const pollIntervalMs = 15_000;

function alertKey(alert) {
  return alert ? `${alert.kind}:${alert.id}` : "";
}

function courierAlert(request) {
  const serviceName = request.serviceType?.name ?? "Corrida";
  return {
    expiresAt: request.expiresAt,
    id: request.id,
    kind: "courier",
    subtitle: request.type === "EQUIPE"
      ? `Chamada direta de ${serviceName} enviada por uma loja da sua equipe.`
      : `Uma chamada de ${serviceName} da sua cidade aguarda o primeiro aceite.`,
    title: request.store?.name ?? `Cliente solicitando ${serviceName}`,
  };
}

function serviceAlert(conversation) {
  return {
    id: conversation.id,
    kind: "service",
    subtitle: "Confira os detalhes e aceite para liberar a negociacao no chat.",
    title: conversation.serviceType?.name ?? conversation.segment?.name ?? "Novo servico",
  };
}

export function GlobalIncomingServiceAlert({ navigationRef }) {
  const { session } = useAuthStore();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const alertRef = useRef(null);
  const dismissedRef = useRef(new Set());
  const refreshRunningRef = useRef(null);

  useEffect(() => {
    alertRef.current = alert;
  }, [alert]);

  const showAlert = useCallback((nextAlert) => {
    if (!nextAlert || dismissedRef.current.has(alertKey(nextAlert))) return;
    setAlert((current) => (
      alertKey(current) === alertKey(nextAlert) ? current : nextAlert
    ));
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.accessToken) return;
    if (refreshRunningRef.current) return refreshRunningRef.current;

    const request = Promise.allSettled([
      getCourierRequests(session.accessToken),
      getServiceConversations(session.accessToken),
    ]).then(([courierResult, serviceResult]) => {
      const courierRequests = courierResult.status === "fulfilled"
        ? courierResult.value.requests ?? []
        : [];
      const serviceConversations = serviceResult.status === "fulfilled"
        ? serviceResult.value.conversations ?? []
        : [];
      const now = Date.now();
      const pendingCourier = courierRequests.find((requestItem) => (
        requestItem.status === "PENDENTE"
        && new Date(requestItem.expiresAt).getTime() > now
      ));
      const pendingService = serviceConversations.find((conversation) => (
        conversation.isSeller
        && conversation.status === "ABERTA"
        && (conversation.isNewForSeller || Number(conversation.unreadCount ?? 0) > 0)
      ));
      const availableKeys = new Set([
        ...courierRequests.map((item) => `courier:${item.id}`),
        ...serviceConversations
          .filter((item) => item.status === "ABERTA")
          .map((item) => `service:${item.id}`),
      ]);

      dismissedRef.current.forEach((key) => {
        if (!availableKeys.has(key)) dismissedRef.current.delete(key);
      });

      const current = alertRef.current;
      if (current && !availableKeys.has(alertKey(current))) {
        setAlert(null);
      }

      if (pendingCourier) showAlert(courierAlert(pendingCourier));
      else if (pendingService) showAlert(serviceAlert(pendingService));
    }).finally(() => {
      if (refreshRunningRef.current === request) refreshRunningRef.current = null;
    });

    refreshRunningRef.current = request;
    return request;
  }, [session?.accessToken, showAlert]);

  useEffect(() => {
    if (!session?.accessToken) {
      setAlert(null);
      dismissedRef.current.clear();
      return undefined;
    }

    refresh();
    const timer = setInterval(refresh, pollIntervalMs);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const onCourierCreated = ({ request } = {}) => {
      if (request?.status === "PENDENTE") showAlert(courierAlert(request));
      refresh();
    };
    const onServiceCreated = ({ conversation } = {}) => {
      const targeted = Number(conversation?.seller?.userId) === Number(session.user?.id);
      if (targeted && conversation?.status === "ABERTA") showAlert(serviceAlert(conversation));
      refresh();
    };
    const onUpdated = () => refresh();

    socket?.on(realtimeEvents.courierRequestCreated, onCourierCreated);
    socket?.on(realtimeEvents.courierRequestUpdated, onUpdated);
    socket?.on(realtimeEvents.serviceChatCreated, onServiceCreated);
    socket?.on(realtimeEvents.serviceChatUpdated, onUpdated);
    return () => {
      socket?.off(realtimeEvents.courierRequestCreated, onCourierCreated);
      socket?.off(realtimeEvents.courierRequestUpdated, onUpdated);
      socket?.off(realtimeEvents.serviceChatCreated, onServiceCreated);
      socket?.off(realtimeEvents.serviceChatUpdated, onUpdated);
    };
  }, [refresh, session?.accessToken, session?.user?.id, showAlert]);

  useEffect(() => {
    if (!alert || Platform.OS === "web") return undefined;
    const ring = () => Vibration.vibrate([0, 350, 160, 500]);
    ring();
    const timer = setInterval(ring, 4_500);
    return () => {
      clearInterval(timer);
      Vibration.cancel();
    };
  }, [alert]);

  function dismiss() {
    if (alert) dismissedRef.current.add(alertKey(alert));
    setAlert(null);
  }

  function openDesk() {
    dismiss();
    if (navigationRef.isReady()) navigationRef.navigate("ServiceDesk");
  }

  async function accept() {
    if (!alert || !session?.accessToken || loading) return;
    setLoading(true);
    try {
      const response = alert.kind === "courier"
        ? await acceptCourierRequest(session.accessToken, alert.id)
        : await acceptServiceConversation(session.accessToken, alert.id);
      dismissedRef.current.add(alertKey(alert));
      setAlert(null);
      if (navigationRef.isReady()) {
        if (response?.conversation) {
          navigationRef.navigate("ServiceConversation", { conversation: response.conversation });
        } else {
          navigationRef.navigate("ServiceDesk");
        }
      }
    } catch {
      setAlert(null);
      refresh();
      if (navigationRef.isReady()) navigationRef.navigate("ServiceDesk");
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    if (!alert || !session?.accessToken || loading) return;
    setLoading(true);
    try {
      if (alert.kind === "courier") {
        await rejectCourierRequest(session.accessToken, alert.id);
      } else {
        await cancelServiceConversation(session.accessToken, alert.id);
      }
      dismissedRef.current.add(alertKey(alert));
      setAlert(null);
      refresh();
    } catch {
      setAlert(null);
      refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <IncomingServiceAlert
      alert={alert}
      loading={loading}
      onAccept={accept}
      onClose={dismiss}
      onPress={openDesk}
      onReject={reject}
    />
  );
}
