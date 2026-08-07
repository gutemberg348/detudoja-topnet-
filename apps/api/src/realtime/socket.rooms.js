export function adminRoom() {
  return "admins";
}

export function orderRoom(orderId) {
  return `order:${orderId}`;
}

export function storeRoom(storeId) {
  return `store:${storeId}`;
}

export function userRoom(userId) {
  return `user:${userId}`;
}
