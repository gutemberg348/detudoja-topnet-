import { getAdminNetworkOverview } from "./admin-network.service.js";

export async function getAdminNetworkOverviewController(req, res, next) {
  try {
    res.json(await getAdminNetworkOverview(req.query));
  } catch (error) {
    next(error);
  }
}
