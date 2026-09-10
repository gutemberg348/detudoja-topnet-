import { Router } from "express";
import {
  approveKycSubmissionController,
  getAdminKycFileController,
  getAdminKycSubmissionController,
  listAdminKycSubmissionsController,
  rejectKycSubmissionController,
  revokeKycSubmissionController,
} from "../modules/kyc/kyc.controller.js";
import { decideKycSchema, listKycSchema } from "../modules/kyc/kyc.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const adminKycRoutes = Router();

adminKycRoutes.get("/submissions", validate(listKycSchema, "query"), listAdminKycSubmissionsController);
adminKycRoutes.get("/submissions/:submissionId", getAdminKycSubmissionController);
adminKycRoutes.get("/submissions/:submissionId/files/:fileId", getAdminKycFileController);
adminKycRoutes.post("/submissions/:submissionId/approve", validate(decideKycSchema), approveKycSubmissionController);
adminKycRoutes.post("/submissions/:submissionId/reject", validate(decideKycSchema), rejectKycSubmissionController);
adminKycRoutes.post("/submissions/:submissionId/revoke", validate(decideKycSchema), revokeKycSubmissionController);
