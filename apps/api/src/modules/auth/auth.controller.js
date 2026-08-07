import {
  completeCpf,
  getSessionUser,
  login,
  refreshSession,
  register,
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

export function logoutController(_req, res) {
  res.status(204).send();
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
