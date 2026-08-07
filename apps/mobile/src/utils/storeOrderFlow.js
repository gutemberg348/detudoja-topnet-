export const storeOrderFlows = {
  chatNegotiation: "CHAT_NEGOTIATION",
  directCheckout: "DIRECT_CHECKOUT",
};

export function storeUsesChatNegotiation(store) {
  return store?.orderFlow === storeOrderFlows.chatNegotiation;
}
