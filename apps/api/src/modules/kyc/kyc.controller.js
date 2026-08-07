import { verifyCurrentUserDocument } from "./kyc.service.js";

export async function verifyCurrentUserDocumentController(req, res, next) {
  try {
    res.json(await verifyCurrentUserDocument(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}
