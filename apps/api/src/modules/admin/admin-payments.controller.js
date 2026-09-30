import {
  listAdminPayments,
  refreshAdminAsaasRefundPayment,
  refundAdminPayment,
  approveAdminSandboxPayment,
  getAdminPaymentDetails,
  cancelAdminPendingPayment,
  archiveAdminPayment,
} from "./admin-payments.service.js";

export async function archiveAdminPaymentController(req, res, next) {
  try { res.json(await archiveAdminPayment(req.auth.user.id, req.params.paymentId, req.body)); }
  catch (error) { next(error); }
}

export async function getAdminPaymentDetailsController(req, res, next) {
  try { res.json(await getAdminPaymentDetails(req.params.paymentId)); } catch (error) { next(error); }
}

export async function cancelAdminPendingPaymentController(req, res, next) {
  try { res.json(await cancelAdminPendingPayment(req.auth.user.id, req.params.paymentId, req.body)); }
  catch (error) { next(error); }
}

export async function approveAdminSandboxPaymentController(req, res, next) {
  try {
    res.json(await approveAdminSandboxPayment(req.auth.user.id, req.params.paymentId, req.body));
  } catch (error) { next(error); }
}

export async function listAdminPaymentsController(req, res, next) {
  try {
    res.json(await listAdminPayments(req.query));
  } catch (error) {
    next(error);
  }
}

export async function refreshAdminAsaasRefundPaymentController(req, res, next) {
  try {
    res.json(await refreshAdminAsaasRefundPayment(req.params.paymentId));
  } catch (error) {
    next(error);
  }
}

export async function refundAdminPaymentController(req, res, next) {
  try {
    res.json(await refundAdminPayment(req.auth.user.id, req.params.paymentId, req.body));
  } catch (error) {
    next(error);
  }
}
