import {
  getAdminNetworkOverview,
  moveAdminNetworkPlacement,
  updateAdminNetworkEarnings,
} from "./admin-network.service.js";

export async function getAdminNetworkOverviewController(req, res, next) {
  try {
    res.json(await getAdminNetworkOverview(req.query));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminNetworkEarningsController(req, res, next) {
  try {
    res.json(await updateAdminNetworkEarnings(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function moveAdminNetworkPlacementController(req, res, next) {
  try {
    res.json(await moveAdminNetworkPlacement(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}
