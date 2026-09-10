import {
  completeCpf,
  getSessionUser,
  login,
  loginWithSocial,
  logoutSession,
  requestPasswordReset,
  refreshSession,
  register,
  resetPassword,
} from "./auth.service.js";

export async function completeCpfController(req, res, next) {
  try {
    res.json(await completeCpf({ cpf: req.body.cpf, userId: req.auth.user.id }));
  } catch (error) {
    next(error);
  }
}

export function createLoginController(audience) {
  return async (req, res, next) => {
    try {
      res.json(await login({ audience, ...req.body }));
    } catch (error) {
      next(error);
    }
  };
}

export function createSocialLoginController(audience) {
  return async (req, res, next) => {
    try {
      res.json(await loginWithSocial({ audience, ...req.body }));
    } catch (error) {
      next(error);
    }
  };
}

export function createRefreshController(audience) {
  return async (req, res, next) => {
    try {
      res.json(await refreshSession({ audience, ...req.body }));
    } catch (error) {
      next(error);
    }
  };
}

export async function meController(req, res, next) {
  try {
    const user = await getSessionUser({
      audience: req.auth.audience,
      userId: req.auth.user.id,
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(req, res, next) {
  try {
    await logoutSession({
      audience: req.auth.audience,
      refreshToken: req.body.refreshToken,
      userId: req.auth.user.id,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export function createRegisterController(audience) {
  return async (req, res, next) => {
    try {
      res.status(201).json(await register({ audience, ...req.body }));
    } catch (error) {
      next(error);
    }
  };
}

export async function requestPasswordResetController(req, res, next) {
  try {
    res.status(202).json(await requestPasswordReset(req.body));
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(req, res, next) {
  try {
    res.json(await resetPassword(req.body));
  } catch (error) {
    next(error);
  }
}
