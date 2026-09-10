import {
  getAdminWalletOverview,
  updateAdminWalletType,
} from "./admin-wallet.service.js";

export async function getAdminWalletOverviewController(_req, res, next) {
  try {
    res.json(await getAdminWalletOverview());
  } catch (error) {
    next(error);
  }
}

export async function updateAdminWalletTypeController(req, res, next) {
  try {
    res.json(await updateAdminWalletType(req.params.typeId, req.body));
  } catch (error) {
    next(error);
  }
}
