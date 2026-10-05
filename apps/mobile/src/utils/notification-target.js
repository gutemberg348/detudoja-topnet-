const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

export function notificationTarget(data, userId, now = Date.now()) {
  if (!data || !userId || (data.recipientUserId && Number(data.recipientUserId) !== Number(userId))) return null;
  const conversationId = id(data.conversationId), orderId = id(data.orderId), storeId = id(data.storeId);
  // Expired calls still open the desk, which reloads current requests. They must
  // never offer an expired request as an actionable call.
  if (data.screen === "ServiceDesk") {
    const expiry = data.expiresAt ? Date.parse(data.expiresAt) : Infinity;
    return { screen: "ServiceDesk", params: { courierRequestId: expiry > now ? id(data.requestId) : undefined } };
  }
  if (["ServiceConversation", "PersonalConversation"].includes(data.screen) && conversationId) {
    return { screen: data.screen, params: { conversation: { id: conversationId } } };
  }
  if (data.screen === "StoreConversation" && (conversationId || storeId)) {
    return { screen: "StoreConversation", params: {
      ...(conversationId ? { conversation: { id: conversationId } } : {}),
      ...(orderId ? { openOrderId: orderId } : {}), ...(storeId ? { store: { id: storeId }, storeId } : {}),
      scope: data.scope === "seller" ? "seller" : "customer",
    } };
  }
  if (data.screen === "CustomerOrderDetails" && orderId) return { screen: data.screen, params: { order: { id: orderId } } };
  if (data.screen === "SellerOrders") return { screen: "Main", params: { screen: "Vender", params: { notificationOrderId: orderId, notificationStoreId: storeId } } };
  if (data.type === "withdrawal_failed") return { screen: "Withdrawal" };
  if (data.type === "payout_failed") return { screen: "Carteira" };
  return null;
}
