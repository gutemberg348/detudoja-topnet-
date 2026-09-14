import {
  createAdministrator,
  listAdministrators,
  updateAdministratorStatus,
} from "./admin-administrators.service.js";

export async function listAdministratorsController(_req, res, next) {
  try { res.json(await listAdministrators()); } catch (error) { next(error); }
}

export async function createAdministratorController(req, res, next) {
  try {
    res.status(201).json(await createAdministrator(req.auth.user.id, req.body));
  } catch (error) { next(error); }
}

export async function updateAdministratorStatusController(req, res, next) {
  try {
    res.json(await updateAdministratorStatus(
      req.auth.user.id,
      req.params.administratorId,
      req.body.status,
    ));
  } catch (error) { next(error); }
}
