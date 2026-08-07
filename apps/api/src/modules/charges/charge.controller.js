import {
  createStoreQrCharge,
  getChargeForCustomer,
  getGeneratedChargeQr,
  listGeneratedCharges,
  listGeneratedChargesHistory,
  listStoreGeneratedCharges,
  payChargeWithWallet,
} from "./charge.service.js";

export async function createStoreQrChargeController(req, res, next) {
  try {
    res.status(201).json(await createStoreQrCharge(req.auth.user.id, req.params.storeId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function getChargeForCustomerController(req, res, next) {
  try {
    res.json(await getChargeForCustomer(req.auth.user.id, req.params.code));
  } catch (error) {
    next(error);
  }
}

export async function listGeneratedChargesController(req, res, next) {
  try {
    res.json(await listGeneratedCharges(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function listGeneratedChargesHistoryController(req, res, next) {
  try {
    res.json(await listGeneratedChargesHistory(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function listStoreGeneratedChargesController(req, res, next) {
  try {
    res.json(await listStoreGeneratedCharges(req.auth.user.id, req.params.storeId, req.query));
  } catch (error) {
    next(error);
  }
}

export async function getGeneratedChargeQrController(req, res, next) {
  try {
    res.json(await getGeneratedChargeQr(req.auth.user.id, req.params.chargeId));
  } catch (error) {
    next(error);
  }
}

export async function payChargeWithWalletController(req, res, next) {
  try {
    res.json(await payChargeWithWallet(req.auth.user.id, req.params.code));
  } catch (error) {
    next(error);
  }
}
