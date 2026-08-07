import { authenticateJwt } from "./jwt.middleware.js";
import { authAudiences } from "../modules/auth/auth.service.js";

export function authMiddleware(req, _res, next) {
  try {
    authenticateJwt(req, authAudiences.app);
    next();
  } catch (error) {
    next(error);
  }
}
