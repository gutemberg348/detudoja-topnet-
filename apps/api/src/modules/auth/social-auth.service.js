import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

const googleClient = new OAuth2Client();
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function requireAudience(audiences, providerLabel) {
  if (audiences.length === 0) {
    throw new AppError(
      `Login com ${providerLabel} ainda nao foi configurado no servidor`,
      503,
    );
  }
}

function cleanEmail(value) {
  return typeof value === "string" && value.includes("@")
    ? value.trim().toLowerCase()
    : null;
}

function cleanName(value, fallback) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name.slice(0, 160) || fallback;
}

async function verifyGoogleIdToken(idToken) {
  requireAudience(env.socialAuth.googleClientIds, "Google");

  try {
    const ticket = await googleClient.verifyIdToken({
      audience: env.socialAuth.googleClientIds,
      idToken,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || payload.email_verified !== true) {
      throw new AppError("A conta Google precisa ter um e-mail verificado", 401);
    }

    return {
      email: cleanEmail(payload.email),
      name: cleanName(payload.name, "Usuario Brasil Cashback"),
      provider: "GOOGLE",
      providerUserId: payload.sub,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Nao foi possivel validar o login Google", 401);
  }
}

async function verifyAppleIdToken(idToken) {
  requireAudience(env.socialAuth.appleClientIds, "Apple");

  try {
    const { payload } = await jwtVerify(idToken, appleJwks, {
      audience: env.socialAuth.appleClientIds,
      issuer: "https://appleid.apple.com",
    });

    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new AppError("Identidade Apple invalida", 401);
    }

    return {
      email: cleanEmail(payload.email),
      name: "Usuario Brasil Cashback",
      provider: "APPLE",
      providerUserId: payload.sub,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Nao foi possivel validar o login Apple", 401);
  }
}

export async function verifySocialIdentity({ idToken, provider }) {
  if (provider === "GOOGLE") {
    return verifyGoogleIdToken(idToken);
  }

  if (provider === "APPLE") {
    return verifyAppleIdToken(idToken);
  }

  throw new AppError("Provedor social invalido", 400);
}
