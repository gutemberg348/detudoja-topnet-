import {
  approveKycSubmission,
  getAdminKycFile,
  getAdminKycSubmission,
  getCurrentKyc,
  listAdminKycSubmissions,
  rejectKycSubmission,
  revokeKycSubmission,
  submitCurrentUserKyc,
} from "./kyc.service.js";

export async function getCurrentKycController(req, res, next) {
  try { res.json(await getCurrentKyc(req.auth.user.id)); } catch (error) { next(error); }
}

export async function submitCurrentUserKycController(req, res, next) {
  try {
    res.status(201).json(await submitCurrentUserKyc(req.auth.user.id, {
      documentType: req.body.documentType,
      files: req.files,
    }));
  } catch (error) { next(error); }
}

export async function listAdminKycSubmissionsController(req, res, next) {
  try { res.json(await listAdminKycSubmissions(req.query)); } catch (error) { next(error); }
}

export async function getAdminKycSubmissionController(req, res, next) {
  try { res.json(await getAdminKycSubmission(req.params.submissionId)); } catch (error) { next(error); }
}

export async function getAdminKycFileController(req, res, next) {
  try {
    const file = await getAdminKycFile(req.params.submissionId, req.params.fileId);
    res.set({ "Cache-Control": "private, no-store", "Content-Disposition": "inline", "Content-Type": file.mimeType, "X-Content-Type-Options": "nosniff" });
    res.send(file.buffer);
  } catch (error) { next(error); }
}

export async function approveKycSubmissionController(req, res, next) {
  try { res.json(await approveKycSubmission(req.auth.user.id, req.params.submissionId, req.body.reason)); } catch (error) { next(error); }
}

export async function rejectKycSubmissionController(req, res, next) {
  try { res.json(await rejectKycSubmission(req.auth.user.id, req.params.submissionId, req.body.reason)); } catch (error) { next(error); }
}

export async function revokeKycSubmissionController(req, res, next) {
  try { res.json(await revokeKycSubmission(req.auth.user.id, req.params.submissionId, req.body.reason)); } catch (error) { next(error); }
}
