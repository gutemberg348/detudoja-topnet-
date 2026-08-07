import {
  getAdminUser,
  listAdminUsers,
  creditAdminUserWallet,
  updateAdminUser,
  updateAdminUserStatus,
} from "./admin-users.service.js";

export async function listAdminUsersController(req, res, next) {
  try {
    res.json(await listAdminUsers(req.query));
  } catch (error) {
    next(error);
  }
}

export async function getAdminUserController(req, res, next) {
  try {
    res.json(await getAdminUser(req.params.userId));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminUserStatusController(req, res, next) {
  try {
    res.json(await updateAdminUserStatus(req.params.userId, req.body.status));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminUserController(req, res, next) {
  try {
    res.json(await updateAdminUser(req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function creditAdminUserWalletController(req, res, next) {
  try {
    res.json(await creditAdminUserWallet(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}
