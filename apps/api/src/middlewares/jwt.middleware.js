import { verifyAccessToken } from "../modules/auth/auth.service.js";
import { AppError } from "../utils/errors.js";

function getBearerToken(authorization) {
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError("Access token is required", 401);
  }

  return token;
}

export function authenticateJwt(req, audience) {
  const accessToken = getBearerToken(req.headers.authorization);
  const user = verifyAccessToken({ accessToken, audience });

  req.auth = {
    audience,
    token: accessToken,
    user,
  };
}
