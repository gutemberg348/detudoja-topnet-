import {
  getCurrentUser,
  listCurrentUserAddresses,
  updateCurrentUser,
  updateCurrentUserPhoto,
} from "./users.service.js";

export async function currentUserController(req, res, next) {
  try {
    res.json(await getCurrentUser(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function updateCurrentUserPhotoController(req, res, next) {
  try {
    res.json(await updateCurrentUserPhoto(req.auth.user.id, req.file));
  } catch (error) {
    next(error);
  }
}

export async function updateCurrentUserController(req, res, next) {
  try {
    res.json(await updateCurrentUser(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function listCurrentUserAddressesController(req, res, next) {
  try {
    res.json(await listCurrentUserAddresses(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}
