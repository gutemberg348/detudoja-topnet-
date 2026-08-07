export const demoDeliveryFeeCents = 790;

export function productPriceCents(product) {
  return Number(product?.promotionalPriceCents ?? product?.priceCents ?? 0);
}

export function buildCartItem(product, { notes = "", quantity = 1 } = {}) {
  return {
    id: product.id,
    description: product.description ?? "",
    imageUrl: product.imageUrl ?? null,
    name: product.name,
    notes,
    priceCents: productPriceCents(product),
    product,
    quantity,
  };
}

export function cartSubtotalCents(items = []) {
  return items.reduce(
    (total, item) =>
      total + Number(item.priceCents ?? 0) * Number(item.quantity ?? 1),
    0,
  );
}

export function checkoutTotals(items = [], { deliveryMode = "delivery" } = {}) {
  const subtotalCents = cartSubtotalCents(items);
  const deliveryFeeCents = deliveryMode === "delivery" ? demoDeliveryFeeCents : 0;

  return {
    deliveryFeeCents,
    subtotalCents,
    totalCents: subtotalCents + deliveryFeeCents,
  };
}

export function normalizeCart(params = {}) {
  const items = Array.isArray(params.items) ? params.items : [];

  return {
    items,
    store: params.store ?? null,
  };
}
