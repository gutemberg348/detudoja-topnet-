import { AppError } from "../utils/errors.js";

export function roleMiddleware(...allowedRoles) {
  return (req, _res, next) => {
    const userRoles = [
      req.auth?.user?.role,
      ...(Array.isArray(req.auth?.user?.roles) ? req.auth.user.roles : []),
    ].filter(Boolean);

    if (!req.auth?.user || !userRoles.some((role) => allowedRoles.includes(role))) {
      next(new AppError("Insufficient permissions", 403));
      return;
    }

    next();
  };
}
