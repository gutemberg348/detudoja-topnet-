import { Router } from "express";
import {
  createAdministratorController,
  listAdministratorsController,
  updateAdministratorStatusController,
} from "../modules/admin/admin-administrators.controller.js";
import {
  createAdministratorSchema,
  updateAdministratorStatusSchema,
} from "../modules/admin/admin.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminAdministratorsRoutes = Router();

adminAdministratorsRoutes.get("/", listAdministratorsController);
adminAdministratorsRoutes.post("/", validate(createAdministratorSchema), createAdministratorController);
adminAdministratorsRoutes.patch(
  "/:administratorId/status",
  validate(updateAdministratorStatusSchema),
  updateAdministratorStatusController,
);
