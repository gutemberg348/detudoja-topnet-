import test from "node:test";
import assert from "node:assert/strict";
import { notificationTarget } from "../src/utils/notification-target.js";

test("notification taps route to conversations and orders with validated ids", () => {
  for (const screen of ["ServiceConversation", "PersonalConversation"]) {
    assert.deepEqual(notificationTarget({ screen, conversationId: "12", recipientUserId: 7 }, 7), { screen, params: { conversation: { id: 12 } } });
    for (const conversationId of [-1, "bad", 0, 1.2]) assert.equal(notificationTarget({ screen, conversationId }, 7), null);
  }
  assert.deepEqual(notificationTarget({ screen: "CustomerOrderDetails", orderId: 10 }, 7), { screen: "CustomerOrderDetails", params: { order: { id: 10 } } });
  assert.equal(notificationTarget({ screen: "UnsafeScreen" }, 7), null);
});

test("a notification for another account cannot navigate after logging in", () => {
  assert.equal(notificationTarget({ screen: "ServiceDesk", recipientUserId: 9 }, 7), null);
  assert.equal(notificationTarget({ screen: "ServiceDesk" }, null), null);
});

test("expired courier calls open the current desk without selecting a stale request", () => {
  const data = { screen: "ServiceDesk", requestId: 10, expiresAt: "2026-10-04T12:00:00Z" };
  assert.equal(notificationTarget(data, 7, Date.parse("2026-10-04T11:59:00Z")).params.courierRequestId, 10);
  assert.equal(notificationTarget(data, 7, Date.parse("2026-10-04T12:00:00Z")).params.courierRequestId, undefined);
  assert.equal(notificationTarget({ ...data, expiresAt: "invalid" }, 7).params.courierRequestId, undefined);
});

test("store alerts preserve the recipient's scope and refunds open the wallet", () => {
  const target = notificationTarget({ screen: "StoreConversation", conversationId: 12, orderId: 3, storeId: 8, scope: "seller" }, 7);
  assert.equal(target.params.scope, "seller");
  assert.equal(target.params.openOrderId, 3);
  assert.equal(target.params.store.id, 8);
  assert.equal(notificationTarget({ type: "withdrawal_failed" }, 7).screen, "Withdrawal");
  assert.equal(notificationTarget({ type: "payout_failed" }, 7).screen, "Carteira");
});
