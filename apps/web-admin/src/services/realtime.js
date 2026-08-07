import { io } from "socket.io-client";
import { apiBaseUrl } from "./api";

export const realtimeEvents = {
  orderCreated: "order.created",
  orderMessageCreated: "order.message.created",
  orderStatusUpdated: "order.status.updated",
};

let socket = null;

export function getAdminRealtimeSocket(accessToken) {
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
      audience: "detudoja-admin",
      token: accessToken,
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5000,
    timeout: 7000,
  });

  return socket;
}

export function disconnectAdminRealtimeSocket() {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
}
