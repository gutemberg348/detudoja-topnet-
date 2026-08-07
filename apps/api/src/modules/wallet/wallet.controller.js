import {
  getWalletByCode,
  getWalletOverview,
} from "./wallet.service.js";

export async function walletOverviewController(req, res, next) {
  try {
    res.json(await getWalletOverview(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function walletDetailsController(req, res, next) {
  try {
    res.json(await getWalletByCode(req.auth.user.id, req.params.code));
  } catch (error) {
    next(error);
  }
}
