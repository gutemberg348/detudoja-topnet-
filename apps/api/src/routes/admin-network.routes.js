import { Router } from "express";
import { getAdminNetworkOverviewController } from "../modules/admin/admin-network.controller.js";

export const adminNetworkRoutes = Router();

adminNetworkRoutes.get("/", getAdminNetworkOverviewController);
