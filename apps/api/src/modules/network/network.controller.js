import { getNetworkOverview } from "./network.service.js";

export async function networkOverviewController(req, res, next) {
  try {
    res.json(await getNetworkOverview(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}
