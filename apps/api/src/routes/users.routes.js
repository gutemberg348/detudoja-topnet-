import { Router } from "express";
import {
  currentUserController,
  listCurrentUserAddressesController,
  updateCurrentUserController,
  updateCurrentUserPhotoController,
} from "../modules/users/users.controller.js";
import { handleUpload, uploadUserProfilePhoto } from "../modules/uploads/upload.middleware.js";
import { updateCurrentUserSchema } from "../modules/users/users.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const usersRoutes = Router();

usersRoutes.get("/me", currentUserController);
usersRoutes.get("/me/addresses", listCurrentUserAddressesController);
usersRoutes.patch("/me", validate(updateCurrentUserSchema), updateCurrentUserController);
usersRoutes.patch("/me/photo", handleUpload(uploadUserProfilePhoto), updateCurrentUserPhotoController);
