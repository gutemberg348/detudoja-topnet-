import { apiRequest } from "./api";

function appendText(formData, key, value) {
  if (value === undefined || value === null) {
    return;
  }

  formData.append(key, String(value));
}

function appendImage(formData, key, image, fallbackName) {
  if (!image) {
    return;
  }

  if (image.file) {
    formData.append(key, image.file);
    return;
  }

  if (!image.uri) {
    return;
  }

  const cleanUri = image.uri.split("?")[0];
  const extension = cleanUri.includes(".")
    ? cleanUri.split(".").pop().toLowerCase()
    : "jpg";
  const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
  const mimeType =
    image.mimeType ??
    (normalizedExtension === "png"
      ? "image/png"
      : normalizedExtension === "webp"
        ? "image/webp"
        : "image/jpeg");

  formData.append(key, {
    name: `${fallbackName}.${normalizedExtension}`,
    type: mimeType,
    uri: image.uri,
  });
}

export function getSellerSegments(accessToken) {
  return apiRequest("/api/app/seller/segments", { token: accessToken });
}

export function getSellerStoreCategories(accessToken) {
  return apiRequest("/api/app/seller/store-categories", { token: accessToken });
}

export function getSellerProfile(accessToken) {
  return apiRequest("/api/app/seller/profile", { token: accessToken });
}

export function getPayoutAccount(accessToken) {
  return apiRequest("/api/app/seller/payout-account", { token: accessToken });
}

export function savePayoutAccount(accessToken, data) {
  return apiRequest("/api/app/seller/payout-account", {
    body: data,
    method: "PUT",
    token: accessToken,
  });
}

export function getGeneratedCharges(accessToken) {
  return apiRequest("/api/app/seller/charges", { token: accessToken });
}

export function getGeneratedChargesHistory(accessToken) {
  return apiRequest("/api/app/seller/charges/history", { token: accessToken });
}

export function getStoreGeneratedCharges(accessToken, storeId, cursor) {
  const search = new URLSearchParams();

  if (cursor) {
    search.set("cursor", String(cursor));
  }

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiRequest(`/api/app/seller/stores/${storeId}/charges${suffix}`, {
    token: accessToken,
  });
}

export function getGeneratedChargeQr(accessToken, chargeId) {
  return apiRequest(`/api/app/seller/charges/${chargeId}/qr`, {
    token: accessToken,
  });
}

export function getStoreSignupQr(accessToken, storeId) {
  return apiRequest(`/api/app/seller/stores/${storeId}/signup-qr`, {
    token: accessToken,
  });
}

export function createSellerOnboarding(accessToken, data) {
  return apiRequest("/api/app/seller/onboarding", {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function createAutonomousSale(accessToken, data) {
  return apiRequest("/api/app/seller/sales", {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function createStoreQrCharge(accessToken, storeId, data) {
  return apiRequest(`/api/app/seller/stores/${storeId}/charges`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function createSellerStore(accessToken, data) {
  return apiRequest("/api/app/seller/stores", {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function updateSellerStore(accessToken, storeId, data) {
  return apiRequest(`/api/app/seller/stores/${storeId}`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function deleteSellerStore(accessToken, storeId) {
  return apiRequest(`/api/app/seller/stores/${storeId}`, {
    method: "DELETE",
    token: accessToken,
  });
}

export function updateSellerStoreMedia(accessToken, storeId, data) {
  const body = new FormData();

  appendText(body, "description", data.description ?? "");
  appendImage(body, "logo", data.logo, "logo-loja");
  appendImage(body, "banner", data.banner, "banner-loja");

  return apiRequest(`/api/app/seller/stores/${storeId}/media`, {
    body,
    method: "PATCH",
    token: accessToken,
  });
}

export function createStoreProduct(accessToken, storeId, data) {
  const body = new FormData();

  appendText(body, "acceptDelivery", data.acceptDelivery);
  appendText(body, "acceptPickup", data.acceptPickup);
  appendText(body, "brand", data.brand ?? "");
  appendText(body, "description", data.description ?? "");
  appendText(body, "details", data.details ? JSON.stringify(data.details) : undefined);
  appendText(body, "estimatedTimeMinutes", data.estimatedTimeMinutes);
  appendText(body, "featured", data.featured);
  appendText(body, "name", data.name);
  appendText(body, "priceCents", data.priceCents);
  appendText(body, "promotionalPriceCents", data.promotionalPriceCents);
  appendText(body, "shortDescription", data.shortDescription ?? "");
  appendText(body, "sku", data.sku ?? "");
  appendText(body, "stockControlled", data.stockControlled);
  appendText(body, "stockQuantity", data.stockQuantity);
  appendText(body, "unit", data.unit ?? "");
  appendImage(body, "image", data.image, "produto");

  return apiRequest(`/api/app/seller/stores/${storeId}/products`, {
    body,
    method: "POST",
    token: accessToken,
  });
}

export function updateStoreProduct(accessToken, storeId, productId, data) {
  const body = new FormData();

  appendText(body, "acceptDelivery", data.acceptDelivery);
  appendText(body, "acceptPickup", data.acceptPickup);
  appendText(body, "brand", data.brand ?? "");
  appendText(body, "description", data.description ?? "");
  appendText(body, "details", data.details ? JSON.stringify(data.details) : undefined);
  appendText(body, "estimatedTimeMinutes", data.estimatedTimeMinutes);
  appendText(body, "featured", data.featured);
  appendText(body, "name", data.name);
  appendText(body, "priceCents", data.priceCents);
  appendText(body, "promotionalPriceCents", data.promotionalPriceCents);
  appendText(body, "shortDescription", data.shortDescription ?? "");
  appendText(body, "sku", data.sku ?? "");
  appendText(body, "stockControlled", data.stockControlled);
  appendText(body, "stockQuantity", data.stockQuantity);
  appendText(body, "unit", data.unit ?? "");
  appendImage(body, "image", data.image, "produto");

  return apiRequest(`/api/app/seller/stores/${storeId}/products/${productId}`, {
    body,
    method: "PATCH",
    token: accessToken,
  });
}

export function deleteStoreProduct(accessToken, storeId, productId) {
  return apiRequest(`/api/app/seller/stores/${storeId}/products/${productId}`, {
    method: "DELETE",
    token: accessToken,
  });
}

export function updateStoreOrderStatus(accessToken, storeId, orderId, status) {
  return apiRequest(`/api/app/seller/stores/${storeId}/orders/${orderId}/status`, {
    body: { status },
    method: "PATCH",
    token: accessToken,
  });
}

export function getStoreOrderMessages(accessToken, storeId, orderId) {
  return apiRequest(`/api/app/seller/stores/${storeId}/orders/${orderId}/messages`, {
    token: accessToken,
  });
}

export function sendStoreOrderMessage(accessToken, storeId, orderId, message) {
  return apiRequest(`/api/app/seller/stores/${storeId}/orders/${orderId}/messages`, {
    body: { message },
    method: "POST",
    token: accessToken,
  });
}

export function createStoreOrderProposal(accessToken, storeId, orderId, data) {
  return apiRequest(`/api/app/seller/stores/${storeId}/orders/${orderId}/proposals`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}
