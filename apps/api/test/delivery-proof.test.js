import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliveryCodeForOrder,
  externalDeliveryTokenForOrder,
  isAssignedDeliveryCourier,
  matchesDeliveryCode,
  matchesExternalDeliveryToken,
} from "../src/modules/orders/delivery-proof.js";
import { renderExternalDeliveryPage } from "../src/modules/orders/external-delivery.service.js";

test("delivery code is stable per order, numeric and not an order identifier", () => {
  const order = { id: 14, codigo: "DTJ-EXAMPLE-01" };
  const code = deliveryCodeForOrder(order);
  assert.match(code, /^\d{4}$/);
  assert.equal(deliveryCodeForOrder(order), code);
  assert.equal(matchesDeliveryCode(order, code), true);
  assert.equal(matchesDeliveryCode(order, "123"), false);
  assert.equal(matchesDeliveryCode(order, `${code}1234`), false);
  assert.equal(matchesDeliveryCode({ ...order, id: 15 }, code), false);
});

test("only the courier who accepted the linked store request may confirm delivery", () => {
  const order = { id: 22, loja_id: 8 };
  const ride = {
    loja_solicitante_id: 8,
    pedido_loja_id: 22,
    status: "ACORDADA",
    vendedor: { usuario_id: 31, motoboy: { id: 51 } },
    solicitacao_motoboy: { motoboy_aceite_id: 51, status: "ACEITA" },
  };
  assert.equal(isAssignedDeliveryCourier(order, ride, 31), true);
  assert.equal(isAssignedDeliveryCourier(order, ride, 32), false);
  assert.equal(isAssignedDeliveryCourier(order, { ...ride, loja_solicitante_id: 9 }, 31), false);
  assert.equal(isAssignedDeliveryCourier(order, { ...ride, pedido_loja_id: 23 }, 31), false);
  assert.equal(isAssignedDeliveryCourier(order, { ...ride, status: "CANCELADA" }, 31), false);
  assert.equal(isAssignedDeliveryCourier(order, {
    ...ride,
    solicitacao_motoboy: { motoboy_aceite_id: 52, status: "ACEITA" },
  }, 31), false);
});

test("external link token is bound to the order and store, separate from the customer code", () => {
  const order = { id: 28, loja_id: 7, codigo: "DTJ-EXTERNAL-01" };
  const token = externalDeliveryTokenForOrder(order);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(externalDeliveryTokenForOrder(order), token);
  assert.equal(matchesExternalDeliveryToken(order, token), true);
  assert.equal(matchesExternalDeliveryToken(order, deliveryCodeForOrder(order)), false);
  assert.equal(matchesExternalDeliveryToken({ ...order, id: 29 }, token), false);
  assert.equal(matchesExternalDeliveryToken({ ...order, loja_id: 8 }, token), false);
});

test("public confirmation page contains neither the link token nor the delivery code", () => {
  const order = { id: 28, loja_id: 7, codigo: "DTJ-EXTERNAL-01" };
  const page = renderExternalDeliveryPage(order.id);
  assert.ok(page.includes("/api/public/entrega/"));
  assert.equal(page.includes(externalDeliveryTokenForOrder(order)), false);
  assert.equal(page.includes(deliveryCodeForOrder(order)), false);
});
