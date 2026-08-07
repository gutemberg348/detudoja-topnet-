import { Router } from "express";
import {
  createAdminSalesSegmentController,
  deleteAdminSalesSegmentController,
  listAdminSalesSegmentsController,
  updateAdminSalesSegmentController,
} from "../modules/admin/admin-segments.controller.js";
import {
  createAdminSalesSegmentSchema,
  updateAdminSalesSegmentSchema,
} from "../modules/admin/admin.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminSegmentsRoutes = Router();

adminSegmentsRoutes.get("/", listAdminSalesSegmentsController);
adminSegmentsRoutes.post(
  "/",
  validate(createAdminSalesSegmentSchema),
  createAdminSalesSegmentController,
);
adminSegmentsRoutes.patch(
  "/:segmentId",
  validate(updateAdminSalesSegmentSchema),
  updateAdminSalesSegmentController,
);
adminSegmentsRoutes.delete("/:segmentId", deleteAdminSalesSegmentController);
