import { io } from "socket.io-client";
import { apiBaseUrl } from "./api";

export const realtimeEvents = {
  chargeUpdated: "charge.updated",
  courierTeamUpdated: "courier.team.updated",
  courierRequestCreated: "courier.request.created",
  courierRequestUpdated: "courier.request.updated",
  orderCreated: "order.created",
  orderMessageCreated: "order.message.created",
  orderStatusUpdated: "order.status.updated",
  personalChatCreated: "personal-chat.created",
  personalChatMessageCreated: "personal-chat.message.created",
  personalChatUpdated: "personal-chat.updated",
  serviceAvailabilityUpdated: "service.availability.updated",
  serviceChatCreated: "service-chat.created",
  serviceChatMessageCreated: "service-chat.message.created",
  serviceChatUpdated: "service-chat.updated",
  storeChatCreated: "store-chat.created",
  storeChatMessageCreated: "store-chat.message.created",
  storeChatUpdated: "store-chat.updated",
  walletUpdated: "wallet.updated",
};

let socket = null;

export function getRealtimeSocket(accessToken) {
  if (!accessToken) {
    return null;
  }

  if (socket?.auth?.token === accessToken) {
    if (!socket.connected) {
      socket.connect();
    }

    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(apiBaseUrl, {
    auth: {
      audience: "detudoja-app",
      token: accessToken,
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5000,
    timeout: 7000,
    // O app usa conexao persistente. Impede o fallback inicial para long-polling.
    transports: ["websocket"],
  });

  return socket;
}

export function disconnectRealtimeSocket() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
}
