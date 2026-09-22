import { apiBlob, apiGet, apiRequest } from "./api";

function withQuery(path, params) {
  const query = new URLSearchParams();

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function getAdminDashboard(accessToken) {
  return apiGet("/api/admin/dashboard", accessToken);
}

export function getAdministrators(accessToken) {
  return apiGet("/api/admin/administrators", accessToken);
}

export function createAdministrator(accessToken, administrator) {
  return apiRequest("/api/admin/administrators", {
    body: administrator,
    method: "POST",
    token: accessToken,
  });
}

export function updateAdministratorStatus(accessToken, administratorId, status) {
  return apiRequest(`/api/admin/administrators/${administratorId}/status`, {
    body: { status },
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminKycSubmissions(accessToken, params) {
  return apiGet(withQuery("/api/admin/kyc/submissions", params), accessToken);
}

export function getAdminKycFile(accessToken, fileUrl) {
  return apiBlob(fileUrl, accessToken);
}

export function approveAdminKyc(accessToken, submissionId, reason) {
  return apiRequest(`/api/admin/kyc/submissions/${submissionId}/approve`, {
    body: { reason },
    method: "POST",
    token: accessToken,
  });
}

export function rejectAdminKyc(accessToken, submissionId, reason) {
  return apiRequest(`/api/admin/kyc/submissions/${submissionId}/reject`, {
    body: { reason },
    method: "POST",
    token: accessToken,
  });
}

export function revokeAdminKyc(accessToken, submissionId, reason) {
  return apiRequest(`/api/admin/kyc/submissions/${submissionId}/revoke`, {
    body: { reason },
    method: "POST",
    token: accessToken,
  });
}

export function getAdminPayments(accessToken, params) {
  return apiGet(withQuery("/api/admin/payments", params), accessToken);
}

export function refundAdminPayment(accessToken, paymentId, reason) {
  return apiRequest(`/api/admin/payments/${paymentId}/refund`, {
    body: { reason },
    method: "POST",
    token: accessToken,
  });
}

export function refreshAdminRefund(accessToken, paymentId) {
  return apiRequest(`/api/admin/payments/${paymentId}/refund/refresh`, {
    method: "POST",
    token: accessToken,
  });
}

export function getAdminNetwork(accessToken, params) {
  return apiGet(withQuery("/api/admin/network", params), accessToken);
}

export function moveAdminNetworkPlacement(accessToken, userId, data) {
  return apiRequest(`/api/admin/network/placements/${userId}`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminNetworkEarnings(accessToken, userId, data) {
  return apiRequest(`/api/admin/network/members/${userId}/earnings`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminUsers(accessToken, params, { signal } = {}) {
  return apiRequest(withQuery("/api/admin/users", params), { token: accessToken, signal });
}

export function getAdminUser(accessToken, userId) {
  return apiGet(`/api/admin/users/${userId}`, accessToken);
}

export function updateAdminUserStatus(accessToken, userId, status) {
  return apiRequest(`/api/admin/users/${userId}/status`, {
    body: { status },
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminUser(accessToken, userId, user) {
  return apiRequest(`/api/admin/users/${userId}`, {
    body: user,
    method: "PATCH",
    token: accessToken,
  });
}

export function approveAdminUserKycWithoutDocuments(accessToken, userId, reason) {
  return apiRequest(`/api/admin/users/${userId}/kyc/approve-without-documents`, {
    body: { reason },
    method: "POST",
    token: accessToken,
  });
}

export function updateAdminUserPassword(accessToken, userId, data) {
  return apiRequest(`/api/admin/users/${userId}/password`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminPayoutAccount(accessToken, userId, data) {
  return apiRequest(`/api/admin/users/${userId}/payout-account`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function creditAdminUserWallet(accessToken, userId, data) {
  return apiRequest(`/api/admin/users/${userId}/wallet-credit`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function adjustAdminUserWallet(accessToken, userId, data) {
  return apiRequest(`/api/admin/users/${userId}/wallet-adjustment`, {
    body: data,
    method: "POST",
    token: accessToken,
  });
}

export function updateAdminSellerProfile(accessToken, userId, data) {
  return apiRequest(`/api/admin/users/${userId}/seller-profile`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminCourierProfile(accessToken, userId, data) {
  return apiRequest(`/api/admin/users/${userId}/courier-profile`, {
    body: data,
    method: "PATCH",
    token: accessToken,
  });
}

export function addAdminUserService(accessToken, userId, serviceTypeId) {
  return apiRequest(`/api/admin/users/${userId}/seller-services`, {
    body: { serviceTypeId },
    method: "POST",
    token: accessToken,
  });
}

export function activateAllAdminUserServices(accessToken, userId) {
  return apiRequest(`/api/admin/users/${userId}/seller-services/activate-all`, {
    method: "POST",
    token: accessToken,
  });
}

export function updateAdminUserService(accessToken, userId, sellerServiceId, status) {
  return apiRequest(`/api/admin/users/${userId}/seller-services/${sellerServiceId}`, {
    body: { status },
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminWallets(accessToken) {
  return apiGet("/api/admin/wallet", accessToken);
}

export function updateAdminWalletType(accessToken, typeId, canWithdraw) {
  return apiRequest(`/api/admin/wallet/types/${typeId}`, {
    body: { canWithdraw },
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminCategories(accessToken, params) {
  return apiGet(withQuery("/api/admin/categories", params), accessToken);
}

export function createAdminCategory(accessToken, category) {
  return apiRequest("/api/admin/categories", {
    body: category,
    method: "POST",
    token: accessToken,
  });
}

export function updateAdminCategory(accessToken, categoryId, category) {
  return apiRequest(`/api/admin/categories/${categoryId}`, {
    body: category,
    method: "PATCH",
    token: accessToken,
  });
}

export function deleteAdminCategory(accessToken, categoryId) {
  return apiRequest(`/api/admin/categories/${categoryId}`, {
    method: "DELETE",
    token: accessToken,
  });
}

export function getAdminSegments(accessToken, params) {
  return apiGet(withQuery("/api/admin/segments", params), accessToken);
}

export function createAdminSegment(accessToken, segment) {
  return apiRequest("/api/admin/segments", {
    body: segment,
    method: "POST",
    token: accessToken,
  });
}

export function updateAdminSegment(accessToken, segmentId, segment) {
  return apiRequest(`/api/admin/segments/${segmentId}`, {
    body: segment,
    method: "PATCH",
    token: accessToken,
  });
}

export function deleteAdminSegment(accessToken, segmentId) {
  return apiRequest(`/api/admin/segments/${segmentId}`, {
    method: "DELETE",
    token: accessToken,
  });
}

export function getAdminServiceTypes(accessToken, params) {
  return apiGet(withQuery("/api/admin/service-types", params), accessToken);
}

export function createAdminServiceType(accessToken, serviceType) {
  return apiRequest("/api/admin/service-types", {
    body: serviceType,
    method: "POST",
    token: accessToken,
  });
}

export function updateAdminServiceType(accessToken, serviceTypeId, serviceType) {
  return apiRequest(`/api/admin/service-types/${serviceTypeId}`, {
    body: serviceType,
    method: "PATCH",
    token: accessToken,
  });
}

export function deleteAdminServiceType(accessToken, serviceTypeId) {
  return apiRequest(`/api/admin/service-types/${serviceTypeId}`, {
    method: "DELETE",
    token: accessToken,
  });
}

export function getAdminStores(accessToken, params) {
  return apiGet(withQuery("/api/admin/merchants/stores", params), accessToken);
}

export function getAdminStore(accessToken, storeId) {
  return apiGet(`/api/admin/merchants/stores/${storeId}`, accessToken);
}

export function updateAdminStore(accessToken, storeId, store) {
  return apiRequest(`/api/admin/merchants/stores/${storeId}`, {
    body: store,
    method: "PATCH",
    token: accessToken,
  });
}

export function deleteAdminStore(accessToken, storeId) {
  return apiRequest(`/api/admin/merchants/stores/${storeId}`, {
    method: "DELETE",
    token: accessToken,
  });
}

export function getAdminSupportSettings(accessToken) {
  return apiGet("/api/admin/settings/support", accessToken);
}

export function updateAdminSupportSettings(accessToken, settings) {
  return apiRequest("/api/admin/settings/support", {
    body: settings,
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminEarningsSettings(accessToken) {
  return apiGet("/api/admin/settings/earnings", accessToken);
}

export function updateAdminCategoryFee(accessToken, categoryId, feePercent) {
  return apiRequest(`/api/admin/settings/earnings/categories/${categoryId}`, {
    body: { feePercent },
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminOrderEarningsDistribution(accessToken, distribution) {
  return apiRequest("/api/admin/settings/earnings/distribution", {
    body: distribution,
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminPaymentPolicy(accessToken, policy) {
  return apiRequest("/api/admin/settings/earnings/payment-policy", {
    body: policy,
    method: "PATCH",
    token: accessToken,
  });
}

export function updateAdminSegmentFee(accessToken, segmentId, commission) {
  return apiRequest(`/api/admin/settings/earnings/segments/${segmentId}`, {
    body: commission,
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminWithdrawalSettings(accessToken) {
  return apiGet("/api/admin/settings/withdrawals", accessToken);
}

export function updateAdminWithdrawalSettings(accessToken, settings) {
  return apiRequest("/api/admin/settings/withdrawals", {
    body: settings,
    method: "PATCH",
    token: accessToken,
  });
}

export function getAdminWithdrawals(accessToken, params = {}) {
  return apiGet(withQuery("/api/admin/withdrawals", params), accessToken);
}

export function approveAdminWithdrawal(accessToken, withdrawalId) {
  return apiRequest(`/api/admin/withdrawals/${withdrawalId}/approve`, {
    method: "POST",
    token: accessToken,
  });
}

export function rejectAdminWithdrawal(accessToken, withdrawalId, reason) {
  return apiRequest(`/api/admin/withdrawals/${withdrawalId}/reject`, {
    body: { reason },
    method: "POST",
    token: accessToken,
  });
}

export function refreshAdminWithdrawal(accessToken, withdrawalId) {
  return apiRequest(`/api/admin/withdrawals/${withdrawalId}/refresh`, {
    method: "POST",
    token: accessToken,
  });
}
