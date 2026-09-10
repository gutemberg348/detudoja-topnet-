import {
  getPayoutAccount,
  savePayoutAccount,
} from "./payout.service.js";

export async function getPayoutAccountController(req, res, next) {
  try {
    res.json(await getPayoutAccount(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function savePayoutAccountController(req, res, next) {
  try {
    res.json(await savePayoutAccount(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}
