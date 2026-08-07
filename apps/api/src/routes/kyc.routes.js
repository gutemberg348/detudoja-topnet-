import { Router } from "express";
import { verifyCurrentUserDocumentController } from "../modules/kyc/kyc.controller.js";

export const kycRoutes = Router();

kycRoutes.post("/verify", verifyCurrentUserDocumentController);
