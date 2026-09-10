import { Router } from "express";
import {
  getAdminNetworkOverviewController,
  moveAdminNetworkPlacementController,
} from "../modules/admin/admin-network.controller.js";
import { moveAdminNetworkPlacementSchema } from "../modules/admin/admin.validator.js";
import { roleMiddleware } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminNetworkRoutes = Router();

adminNetworkRoutes.get("/", getAdminNetworkOverviewController);
adminNetworkRoutes.patch(
  "/placements/:userId",
  roleMiddleware("super_admin"),
  validate(moveAdminNetworkPlacementSchema),
  moveAdminNetworkPlacementController,
);
