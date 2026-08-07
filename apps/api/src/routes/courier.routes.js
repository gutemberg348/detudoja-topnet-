import { Router } from "express";
import {
  addStoreCourierController,
  getCourierProfileController,
  listStoreCourierTeamController,
  removeStoreCourierController,
  saveCourierProfileController,
  acceptCourierRequestController,
  cancelCourierRequestController,
  createCourierRequestController,
  getStoreCourierDispatchController,
  listCourierRequestsController,
} from "../modules/courier/courier.controller.js";
import {
  addStoreCourierSchema,
  createCourierRequestSchema,
  saveCourierProfileSchema,
} from "../modules/courier/courier.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const courierRoutes = Router();

courierRoutes.get("/profile", getCourierProfileController);
courierRoutes.put("/profile", validate(saveCourierProfileSchema), saveCourierProfileController);
courierRoutes.get("/requests", listCourierRequestsController);
courierRoutes.post("/requests/:requestId/accept", acceptCourierRequestController);
courierRoutes.post("/requests/:requestId/cancel", cancelCourierRequestController);
courierRoutes.get("/stores/:storeId/dispatch", getStoreCourierDispatchController);
courierRoutes.post("/stores/:storeId/requests", validate(createCourierRequestSchema), createCourierRequestController);
courierRoutes.get("/stores/:storeId/team", listStoreCourierTeamController);
courierRoutes.post("/stores/:storeId/team", validate(addStoreCourierSchema), addStoreCourierController);
courierRoutes.delete("/stores/:storeId/team/:memberId", removeStoreCourierController);
