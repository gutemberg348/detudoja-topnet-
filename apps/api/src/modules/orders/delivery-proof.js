import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

export function deliveryCodeForOrder(order) {
  const digest = createHmac("sha256", env.jwt.refreshSecret)
    .update(`detudoja:delivery-proof:v1:${order.id}:${order.codigo}`)
    .digest();
  return String(digest.readBigUInt64BE(0) % 10_000n).padStart(4, "0");
}

export function matchesDeliveryCode(order, submitted) {
  if (typeof submitted !== "string" || !/^\d{4}$/.test(submitted)) return false;
  return timingSafeEqual(Buffer.from(deliveryCodeForOrder(order)), Buffer.from(submitted));
}

export function externalDeliveryTokenForOrder(order) {
  return createHmac("sha256", env.jwt.refreshSecret)
    .update(`detudoja:external-delivery:v1:${order.id}:${order.loja_id}:${order.codigo}`)
    .digest("base64url");
}

export function matchesExternalDeliveryToken(order, submitted) {
  if (typeof submitted !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(submitted)) return false;
  return timingSafeEqual(Buffer.from(externalDeliveryTokenForOrder(order)), Buffer.from(submitted));
}

export function isAssignedDeliveryCourier(order, ride, userId) {
  return Boolean(
    ride
    && ride.pedido_loja_id === order.id
    && ride.vendedor?.usuario_id === userId
    && ride.loja_solicitante_id === order.loja_id
    && ride.vendedor?.motoboy?.id === ride.solicitacao_motoboy?.motoboy_aceite_id
    && ["ACEITA", "CONCLUIDA"].includes(ride.solicitacao_motoboy?.status)
    && !["CANCELADA", "EM_DISPUTA"].includes(ride.status),
  );
}
