import { Router } from "express";
import {
  createAdminServiceTypeController,
  deleteAdminServiceTypeController,
  listAdminServiceTypesController,
  updateAdminServiceTypeController,
} from "../modules/admin/admin-service-types.controller.js";
import {
  createAdminServiceTypeSchema,
  updateAdminServiceTypeSchema,
} from "../modules/admin/admin.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminServiceTypesRoutes = Router();

adminServiceTypesRoutes.get("/", listAdminServiceTypesController);
adminServiceTypesRoutes.post("/", validate(createAdminServiceTypeSchema), createAdminServiceTypeController);
adminServiceTypesRoutes.patch("/:serviceTypeId", validate(updateAdminServiceTypeSchema), updateAdminServiceTypeController);
adminServiceTypesRoutes.delete("/:serviceTypeId", deleteAdminServiceTypeController);
