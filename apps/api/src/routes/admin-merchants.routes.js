import { Router } from "express";
import {
  deleteAdminStoreController,
  getAdminStoreController,
  listAdminStoresController,
  updateAdminStoreController,
} from "../modules/admin/admin-stores.controller.js";
import { updateAdminStoreSchema } from "../modules/admin/admin.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminMerchantsRoutes = Router();

adminMerchantsRoutes.get("/stores", listAdminStoresController);
adminMerchantsRoutes.get("/stores/:storeId", getAdminStoreController);
adminMerchantsRoutes.patch(
  "/stores/:storeId",
  validate(updateAdminStoreSchema),
  updateAdminStoreController,
);
adminMerchantsRoutes.delete("/stores/:storeId", deleteAdminStoreController);
