import { useCallback, useEffect, useState } from "react";
import { getWalletOverview } from "../services/wallet.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "./useAuthStore";

const initialData = {
  movements: [],
  summary: {
    availableCents: 0,
    blockedCents: 0,
    pendingCents: 0,
    totalCents: 0,
  },
  wallets: [],
};

export function useWalletStore() {
  const { session } = useAuthStore();
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.accessToken) {
      setIsLoading(false);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      setData(await getWalletOverview(session.accessToken));
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel carregar as carteiras.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session?.accessToken) {
      return undefined;
    }

    const socket = getRealtimeSocket(session.accessToken);

    if (!socket) {
      return undefined;
    }

    socket.on(realtimeEvents.walletUpdated, refresh);

    return () => {
      socket.off(realtimeEvents.walletUpdated, refresh);
    };
  }, [refresh, session?.accessToken]);

  return { ...data, error, isLoading, refresh };
}
