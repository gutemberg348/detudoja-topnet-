import { Router } from "express";
import { getSupportSettingsController } from "../modules/support/support.controller.js";

export const supportRoutes = Router();

supportRoutes.get("/", getSupportSettingsController);
