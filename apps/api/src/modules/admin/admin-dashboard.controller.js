import { getAdminDashboard } from "./admin-dashboard.service.js";

export async function adminDashboardController(_req, res, next) {
  try {
    res.json(await getAdminDashboard());
  } catch (error) {
    next(error);
  }
}
