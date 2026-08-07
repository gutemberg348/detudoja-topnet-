import { useEffect } from "react";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";

export function useRealtimeCharge({ accessToken, chargeId, onChargeUpdated }) {
  useEffect(() => {
    if (!accessToken || !chargeId) {
      return undefined;
    }

    const socket = getRealtimeSocket(accessToken);

    if (!socket) {
      return undefined;
    }

    function handleChargeUpdated(payload = {}) {
      if (Number(payload.charge?.id) === Number(chargeId)) {
        onChargeUpdated?.(payload.charge);
      }
    }

    socket.on(realtimeEvents.chargeUpdated, handleChargeUpdated);

    return () => {
      socket.off(realtimeEvents.chargeUpdated, handleChargeUpdated);
    };
  }, [accessToken, chargeId, onChargeUpdated]);
}
