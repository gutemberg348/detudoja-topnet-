import { Server } from "socket.io";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { createSocketIoRedisAdapter } from "../config/redis.js";
import {
  authAudiences,
  verifyAccessToken,
} from "../modules/auth/auth.service.js";
import {
  adminRoom,
  orderRoom,
  storeRoom,
  userRoom,
} from "./socket.rooms.js";

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

let io = null;

function getSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;

  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const [scheme, token] =
    socket.handshake.headers?.authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() === "bearer" && token) {
    return token;
  }

  return null;
}

function getSocketAudience(socket) {
  return socket.handshake.auth?.audience === authAudiences.admin
    ? authAudiences.admin
    : authAudiences.app;
}

async function listStoreIdsForUser(userId) {
  const stores = await prisma.loja.findMany({
    select: { id: true },
    where: {
      excluido_em: null,
      OR: [
        { lojista: { usuario_id: userId } },
        {
          usuarios: {
            some: {
              status: "ATIVO",
              usuario_id: userId,
            },
          },
        },
      ],
    },
  });

  return stores.map((store) => store.id);
}

function parsePositiveIntId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findAccessibleOrder(socket, orderId, storeId = null) {
  const auth = socket.data.auth;
  const parsedOrderId = parsePositiveIntId(orderId);
  const parsedStoreId = parsePositiveIntId(storeId);

  if (!auth || !parsedOrderId) {
    return null;
  }

  if (auth.audience === authAudiences.admin) {
    return prisma.pedidoLoja.findFirst({
      select: { id: true, loja_id: true, usuario_id: true },
      where: {
        id: parsedOrderId,
        ...(parsedStoreId ? { loja_id: parsedStoreId } : {}),
      },
    });
  }

  return prisma.pedidoLoja.findFirst({
    select: { id: true, loja_id: true, usuario_id: true },
    where: {
      id: parsedOrderId,
      ...(parsedStoreId ? { loja_id: parsedStoreId } : {}),
      OR: [
        { usuario_id: auth.user.id },
        {
          loja: {
            OR: [
              { lojista: { usuario_id: auth.user.id } },
              {
                usuarios: {
                  some: {
                    status: "ATIVO",
                    usuario_id: auth.user.id,
                  },
                },
              },
            ],
          },
        },
      ],
    },
  });
}

async function findAccessibleStore(socket, storeId) {
  const auth = socket.data.auth;
  const parsedStoreId = parsePositiveIntId(storeId);

  if (!auth || !parsedStoreId) {
    return null;
  }

  if (auth.audience === authAudiences.admin) {
    return prisma.loja.findFirst({
      select: { id: true },
      where: { id: parsedStoreId },
    });
  }

  return prisma.loja.findFirst({
    select: { id: true },
    where: {
      excluido_em: null,
      id: parsedStoreId,
      OR: [
        { lojista: { usuario_id: auth.user.id } },
        {
          usuarios: {
            some: {
              status: "ATIVO",
              usuario_id: auth.user.id,
            },
          },
        },
      ],
    },
  });
}

async function joinInitialRooms(socket) {
  const { audience, user } = socket.data.auth;

  if (audience === authAudiences.admin) {
    socket.join(adminRoom());
    socket.join(userRoom(user.id));
    return;
  }

  socket.join(userRoom(user.id));

  const storeIds = await listStoreIdsForUser(user.id);
  socket.data.storeIds = storeIds;

  for (const storeId of storeIds) {
    socket.join(storeRoom(storeId));
  }
}

function registerJoinHandlers(socket) {
  socket.on("order:join", async (payload = {}, ack) => {
    try {
      const order = await findAccessibleOrder(
        socket,
        payload.orderId,
        payload.storeId,
      );

      if (!order) {
        ack?.({ ok: false, message: "Pedido nao encontrado para esta sessao." });
        return;
      }

      socket.join(orderRoom(order.id));
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, message: "Nao foi possivel acompanhar este pedido." });
    }
  });

  socket.on("order:leave", (payload = {}) => {
    if (payload.orderId) {
      socket.leave(orderRoom(payload.orderId));
    }
  });

  socket.on("store:join", async (payload = {}, ack) => {
    try {
      const store = await findAccessibleStore(socket, payload.storeId);

      if (!store) {
        ack?.({ ok: false, message: "Loja nao encontrada para esta sessao." });
        return;
      }

      socket.join(storeRoom(store.id));
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, message: "Nao foi possivel acompanhar esta loja." });
    }
  });

  socket.on("store:leave", (payload = {}) => {
    if (payload.storeId) {
      socket.leave(storeRoom(payload.storeId));
    }
  });
}

export async function initRealtimeServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      credentials: true,
      origin: env.corsOrigins,
    },
  });

  const redisAdapter = await createSocketIoRedisAdapter();
  if (redisAdapter) {
    io.adapter(redisAdapter);
  }

  io.use((socket, next) => {
    const token = getSocketToken(socket);

    if (!token) {
      next(new Error("Access token is required"));
      return;
    }

    try {
      const audience = getSocketAudience(socket);
      const user = verifyAccessToken({ accessToken: token, audience });

      socket.data.auth = {
        audience,
        token,
        user,
      };

      next();
    } catch {
      next(new Error("Token invalido ou expirado"));
    }
  });

  io.on("connection", async (socket) => {
    try {
      await joinInitialRooms(socket);
      registerJoinHandlers(socket);
    } catch {
      socket.disconnect(true);
    }
  });

  return io;
}

export async function closeRealtimeServer() {
  if (!io) {
    return;
  }

  await new Promise((resolve) => {
    io.close(resolve);
  });

  io = null;
}

function emitToOrderRooms(event, payload, { customerId, orderId, storeId }) {
  let target = io.to(adminRoom()).to(orderRoom(orderId));

  if (storeId) {
    target = target.to(storeRoom(storeId));
  }

  if (customerId) {
    target = target.to(userRoom(customerId));
  }

  target.emit(event, payload);
}

export function emitOrderCreated(order) {
  if (!io || !order) {
    return;
  }

  const customerId = order.customer?.id ?? null;
  const payload = {
    customerId,
    order,
    orderId: order.id,
    storeId: order.storeId,
  };

  emitToOrderRooms(realtimeEvents.orderCreated, payload, {
    customerId,
    orderId: order.id,
    storeId: order.storeId,
  });
}

export function emitOrderStatusUpdated(order) {
  if (!io || !order) {
    return;
  }

  const customerId = order.customer?.id ?? null;
  const payload = {
    customerId,
    order,
    orderId: order.id,
    status: order.status,
    storeId: order.storeId,
  };

  emitToOrderRooms(realtimeEvents.orderStatusUpdated, payload, {
    customerId,
    orderId: order.id,
    storeId: order.storeId,
  });
}

export function emitOrderMessageCreated({
  customerId,
  message,
  orderId,
  storeId,
}) {
  if (!io || !orderId || !message) {
    return;
  }

  const payload = {
    customerId: customerId ?? null,
    message,
    orderId,
    storeId: storeId ?? null,
  };

  emitToOrderRooms(realtimeEvents.orderMessageCreated, payload, {
    customerId,
    orderId,
    storeId,
  });
}

export function emitWalletUpdated({ transactionId, userIds = [] }) {
  if (!io) {
    return;
  }

  for (const userId of new Set(userIds.filter(Boolean))) {
    io.to(userRoom(userId)).emit(realtimeEvents.walletUpdated, {
      transactionId,
      userId,
    });
  }
}

function emitToServiceChatUsers(event, payload, conversation) {
  if (!io || !conversation) {
    return;
  }

  const sellerUserId = conversation.seller?.userId ?? conversation.sellerUserId;
  const customerUserId = conversation.customer?.id ?? conversation.customerUserId;
  let target = io.to(adminRoom());

  if (sellerUserId) {
    target = target.to(userRoom(sellerUserId));
  }

  if (customerUserId) {
    target = target.to(userRoom(customerUserId));
  }

  target.emit(event, payload);
}

export function emitServiceChatCreated(conversation) {
  emitToServiceChatUsers(
    realtimeEvents.serviceChatCreated,
    { conversation, conversationId: conversation?.id },
    conversation,
  );
}

export function emitServiceChatMessageCreated({ conversation, message }) {
  emitToServiceChatUsers(
    realtimeEvents.serviceChatMessageCreated,
    { conversation, conversationId: conversation?.id, message },
    conversation,
  );
}

export function emitServiceChatUpdated({
  conversationId,
  customerUserId,
  reason,
  sellerUserId,
}) {
  if (!io || !conversationId) {
    return;
  }

  let target = io.to(adminRoom());

  if (sellerUserId) {
    target = target.to(userRoom(sellerUserId));
  }

  if (customerUserId) {
    target = target.to(userRoom(customerUserId));
  }

  target.emit(realtimeEvents.serviceChatUpdated, {
    conversationId,
    reason: reason ?? "updated",
  });
}

function emitToStoreChatUsers(
  event,
  payload,
  { customerUserId, storeId },
) {
  if (!io) {
    return;
  }

  let target = io.to(adminRoom());

  if (customerUserId) {
    target = target.to(userRoom(customerUserId));
  }

  if (storeId) {
    target = target.to(storeRoom(storeId));
  }

  target.emit(event, payload);
}

export function emitStoreChatCreated({
  conversationId,
  customerUserId,
  storeId,
}) {
  if (!conversationId) {
    return;
  }

  emitToStoreChatUsers(
    realtimeEvents.storeChatCreated,
    { conversationId, storeId },
    { customerUserId, storeId },
  );
}

export function emitStoreChatMessageCreated({
  conversationId,
  customerUserId,
  message,
  storeId,
}) {
  if (!conversationId || !message) {
    return;
  }

  emitToStoreChatUsers(
    realtimeEvents.storeChatMessageCreated,
    { conversationId, message, storeId },
    { customerUserId, storeId },
  );
}

export function emitStoreChatUpdated({
  conversationId,
  customerUserId,
  reason,
  storeId,
}) {
  if (!conversationId) {
    return;
  }

  emitToStoreChatUsers(
    realtimeEvents.storeChatUpdated,
    {
      conversationId,
      reason: reason ?? "updated",
      storeId,
    },
    { customerUserId, storeId },
  );
}

function emitToPersonalChatUsers(event, payload, userIds = []) {
  if (!io) {
    return;
  }

  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  let target = null;

  uniqueUserIds.forEach((userId) => {
    target = target ? target.to(userRoom(userId)) : io.to(userRoom(userId));
  });

  target?.emit(event, payload);
}

export function emitPersonalChatCreated({ conversationId, userIds }) {
  if (!conversationId) return;
  emitToPersonalChatUsers(
    realtimeEvents.personalChatCreated,
    { conversationId },
    userIds,
  );
}

export function emitPersonalChatMessageCreated({
  conversationId,
  message,
  userIds,
}) {
  if (!conversationId || !message) return;
  emitToPersonalChatUsers(
    realtimeEvents.personalChatMessageCreated,
    { conversationId, message },
    userIds,
  );
}

export function emitPersonalChatUpdated({ conversationId, reason, userIds }) {
  if (!conversationId) return;
  emitToPersonalChatUsers(
    realtimeEvents.personalChatUpdated,
    { conversationId, reason: reason ?? "updated" },
    userIds,
  );
}

export function emitServiceAvailabilityUpdated({
  available,
  sellerId,
  sellerUserId,
  serviceTypeId,
}) {
  if (!io || !serviceTypeId) {
    return;
  }

  // Disponibilidade e informacao publica para a busca de clientes autenticados.
  io.emit(realtimeEvents.serviceAvailabilityUpdated, {
    available: Boolean(available),
    sellerId: sellerId ?? null,
    sellerUserId: sellerUserId ?? null,
    serviceTypeId,
  });
}

export function emitCourierTeamUpdated({ courierUserId = null, storeId }) {
  if (!io || !storeId) {
    return;
  }

  let target = io.to(adminRoom()).to(storeRoom(storeId));
  if (courierUserId) {
    target = target.to(userRoom(courierUserId));
  }

  target.emit(realtimeEvents.courierTeamUpdated, { storeId });
}

export function emitCourierRequestCreated({ request, targetUserIds = [] }) {
  if (!io || !request?.id) return;
  let target = io.to(adminRoom());
  for (const userId of new Set(targetUserIds.filter(Boolean))) {
    target = target.to(userRoom(userId));
  }
  target.emit(realtimeEvents.courierRequestCreated, { request });
}

export function emitCourierRequestUpdated({ request, targetUserIds = [] }) {
  if (!io || !request?.id) return;
  let target = io.to(adminRoom());
  if (request.storeId) target = target.to(storeRoom(request.storeId));
  for (const userId of new Set([
    request.requesterUserId,
    request.acceptedCourierUserId,
    request.targetedCourier?.userId,
    ...targetUserIds,
  ].filter(Boolean))) {
    target = target.to(userRoom(userId));
  }
  target.emit(realtimeEvents.courierRequestUpdated, {
    conversationId: request.conversationId,
    request,
    requestId: request.id,
    status: request.status,
    storeId: request.storeId,
  });
}

export function emitChargeUpdated(charge, { sellerUserId = null, storeId = null } = {}) {
  if (!io || !charge) {
    return;
  }

  let target = io.to(adminRoom());

  if (sellerUserId) {
    target = target.to(userRoom(sellerUserId));
  }

  if (storeId) {
    target = target.to(storeRoom(storeId));
  }

  target.emit(realtimeEvents.chargeUpdated, { charge, storeId });
}
