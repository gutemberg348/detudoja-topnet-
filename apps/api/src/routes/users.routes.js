import { Router } from "express";
import {
  currentUserController,
  listCurrentUserAddressesController,
  updateCurrentUserController,
} from "../modules/users/users.controller.js";
import { updateCurrentUserSchema } from "../modules/users/users.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const usersRoutes = Router();

usersRoutes.get("/me", currentUserController);
usersRoutes.get("/me/addresses", listCurrentUserAddressesController);
usersRoutes.patch("/me", validate(updateCurrentUserSchema), updateCurrentUserController);
