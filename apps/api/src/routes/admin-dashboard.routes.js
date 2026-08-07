import { Router } from "express";
import { adminDashboardController } from "../modules/admin/admin-dashboard.controller.js";

export const adminDashboardRoutes = Router();

adminDashboardRoutes.get("/", adminDashboardController);
