import { Router } from "express";
import {
  walletDetailsController,
  walletOverviewController,
} from "../modules/wallet/wallet.controller.js";

export const walletRoutes = Router();

walletRoutes.get("/", walletOverviewController);
walletRoutes.get("/:code", walletDetailsController);
