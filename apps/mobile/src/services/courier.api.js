import { apiRequest } from "./api";

export function getCourierProfile(token) {
  return apiRequest("/api/app/courier/profile", { token });
}

export function saveCourierProfile(token, data) {
  return apiRequest("/api/app/courier/profile", {
    body: data,
    method: "PUT",
    token,
  });
}

export function getStoreCourierTeam(token, storeId) {
  return apiRequest(`/api/app/courier/stores/${storeId}/team`, { token });
}

export function addStoreCourier(token, storeId, contactPhone) {
  return apiRequest(`/api/app/courier/stores/${storeId}/team`, {
    body: { contactPhone },
    method: "POST",
    token,
  });
}

export function removeStoreCourier(token, storeId, memberId) {
  return apiRequest(`/api/app/courier/stores/${storeId}/team/${memberId}`, {
    method: "DELETE",
    token,
  });
}

export function getStoreCourierDispatch(token, storeId) {
  return apiRequest(`/api/app/courier/stores/${storeId}/dispatch`, { token });
}

export function createStoreCourierRequest(token, storeId, data) {
  return apiRequest(`/api/app/courier/stores/${storeId}/requests`, { body: data, method: "POST", token });
}

export function getCourierRequests(token) {
  return apiRequest("/api/app/courier/requests", { token });
}

export function acceptCourierRequest(token, requestId) {
  return apiRequest(`/api/app/courier/requests/${requestId}/accept`, { body: {}, method: "POST", token });
}

export function cancelCourierRequest(token, requestId) {
  return apiRequest(`/api/app/courier/requests/${requestId}/cancel`, { body: {}, method: "POST", token });
}
