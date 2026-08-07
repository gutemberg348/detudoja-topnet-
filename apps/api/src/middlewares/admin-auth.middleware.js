import { authenticateJwt } from "./jwt.middleware.js";
import {
  authAudiences,
  getSessionUser,
} from "../modules/auth/auth.service.js";

export async function adminAuthMiddleware(req, _res, next) {
  try {
    authenticateJwt(req, authAudiences.admin);
    req.auth.user = await getSessionUser({
      audience: authAudiences.admin,
      userId: req.auth.user.id,
    });
    next();
  } catch (error) {
    next(error);
  }
}
