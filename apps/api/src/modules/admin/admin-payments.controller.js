import {
  listAdminPayments,
  refreshAdminAsaasRefundPayment,
  refundAdminPayment,
} from "./admin-payments.service.js";

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
