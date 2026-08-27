import { Router } from "express";
import {
  addStoreCourierController,
  getCourierProfileController,
  listStoreCourierTeamController,
  removeStoreCourierController,
  saveCourierProfileController,
  updateCourierDispatchScopeController,
  acceptCourierRequestController,
  cancelCourierRequestController,
  createCustomerCourierRequestController,
  createCourierRequestController,
  getCustomerCourierRequestStateController,
  getStoreCourierDispatchController,
  listCourierRequestsController,
} from "../modules/courier/courier.controller.js";
import {
  addStoreCourierSchema,
  createCustomerCourierRequestSchema,
  createCourierRequestSchema,
  saveCourierProfileSchema,
  updateCourierDispatchScopeSchema,
} from "../modules/courier/courier.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const courierRoutes = Router();

courierRoutes.get("/profile", getCourierProfileController);
courierRoutes.put("/profile", validate(saveCourierProfileSchema), saveCourierProfileController);
courierRoutes.patch("/profile/dispatch-scope", validate(updateCourierDispatchScopeSchema), updateCourierDispatchScopeController);
courierRoutes.get("/requests", listCourierRequestsController);
courierRoutes.get("/customer-requests", getCustomerCourierRequestStateController);
courierRoutes.post("/customer-requests", validate(createCustomerCourierRequestSchema), createCustomerCourierRequestController);
courierRoutes.post("/requests/:requestId/accept", acceptCourierRequestController);
courierRoutes.post("/requests/:requestId/cancel", cancelCourierRequestController);
courierRoutes.get("/stores/:storeId/dispatch", getStoreCourierDispatchController);
courierRoutes.post("/stores/:storeId/requests", validate(createCourierRequestSchema), createCourierRequestController);
courierRoutes.get("/stores/:storeId/team", listStoreCourierTeamController);
courierRoutes.post("/stores/:storeId/team", validate(addStoreCourierSchema), addStoreCourierController);
courierRoutes.delete("/stores/:storeId/team/:memberId", removeStoreCourierController);
