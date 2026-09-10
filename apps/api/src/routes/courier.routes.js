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
import {
  courierRequestAcceptRateLimit,
  courierRequestCancelRateLimit,
  courierRequestCreateRateLimit,
} from "../middlewares/rate-limit.middleware.js";

export const courierRoutes = Router();

courierRoutes.get("/profile", getCourierProfileController);
courierRoutes.put("/profile", validate(saveCourierProfileSchema), saveCourierProfileController);
courierRoutes.patch("/profile/dispatch-scope", validate(updateCourierDispatchScopeSchema), updateCourierDispatchScopeController);
courierRoutes.get("/requests", listCourierRequestsController);
courierRoutes.get("/customer-requests", getCustomerCourierRequestStateController);
courierRoutes.post("/customer-requests", courierRequestCreateRateLimit, validate(createCustomerCourierRequestSchema), createCustomerCourierRequestController);
courierRoutes.post("/requests/:requestId/accept", courierRequestAcceptRateLimit, acceptCourierRequestController);
courierRoutes.post("/requests/:requestId/cancel", courierRequestCancelRateLimit, cancelCourierRequestController);
courierRoutes.get("/stores/:storeId/dispatch", getStoreCourierDispatchController);
courierRoutes.post("/stores/:storeId/requests", courierRequestCreateRateLimit, validate(createCourierRequestSchema), createCourierRequestController);
courierRoutes.get("/stores/:storeId/team", listStoreCourierTeamController);
courierRoutes.post("/stores/:storeId/team", validate(addStoreCourierSchema), addStoreCourierController);
courierRoutes.delete("/stores/:storeId/team/:memberId", removeStoreCourierController);
