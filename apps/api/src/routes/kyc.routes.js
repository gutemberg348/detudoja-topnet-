import { Router } from "express";
import { getCurrentKycController, submitCurrentUserKycController } from "../modules/kyc/kyc.controller.js";
import { submitKycSchema } from "../modules/kyc/kyc.validator.js";
import { handleUpload, uploadKycImages } from "../modules/uploads/upload.middleware.js";
import { kycSubmissionRateLimit } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const kycRoutes = Router();

kycRoutes.get("/", getCurrentKycController);
kycRoutes.post(
  "/submissions",
  kycSubmissionRateLimit,
  handleUpload(uploadKycImages),
  validate(submitKycSchema),
  submitCurrentUserKycController,
);
