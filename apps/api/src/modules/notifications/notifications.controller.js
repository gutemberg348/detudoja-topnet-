import { registerPushToken, unregisterPushToken } from "./notifications.service.js";

export async function registerPushTokenController(req, res, next) {
  try {
    await registerPushToken(req.auth.user.id, req.body);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function unregisterPushTokenController(req, res, next) {
  try {
    await unregisterPushToken(req.auth.user.id, req.body.token);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
