import { Router } from "express";
import {
  getAdminNetworkOverviewController,
  moveAdminNetworkPlacementController,
  updateAdminNetworkEarningsController,
} from "../modules/admin/admin-network.controller.js";
import {
  moveAdminNetworkPlacementSchema,
  updateAdminNetworkEarningsSchema,
} from "../modules/admin/admin.validator.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminNetworkRoutes = Router();

adminNetworkRoutes.get("/", getAdminNetworkOverviewController);
adminNetworkRoutes.patch(
  "/members/:userId/earnings",
  roleMiddleware("super_admin"),
  validate(updateAdminNetworkEarningsSchema),
  updateAdminNetworkEarningsController,
);
adminNetworkRoutes.patch(
  "/placements/:userId",
  roleMiddleware("super_admin"),
  validate(moveAdminNetworkPlacementSchema),
  moveAdminNetworkPlacementController,
);
