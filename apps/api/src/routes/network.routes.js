import { Router } from "express";
import { networkOverviewController } from "../modules/network/network.controller.js";

export const networkRoutes = Router();

networkRoutes.get("/", networkOverviewController);
