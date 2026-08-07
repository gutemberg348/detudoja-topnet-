import {
  createAdminServiceType,
  deleteAdminServiceType,
  listAdminServiceTypes,
  updateAdminServiceType,
} from "./admin-service-types.service.js";

export async function listAdminServiceTypesController(req, res, next) {
  try { res.json(await listAdminServiceTypes(req.query)); } catch (error) { next(error); }
}

export async function createAdminServiceTypeController(req, res, next) {
  try { res.status(201).json(await createAdminServiceType(req.body)); } catch (error) { next(error); }
}

export async function updateAdminServiceTypeController(req, res, next) {
  try { res.json(await updateAdminServiceType(req.params.serviceTypeId, req.body)); } catch (error) { next(error); }
}

export async function deleteAdminServiceTypeController(req, res, next) {
  try { await deleteAdminServiceType(req.params.serviceTypeId); res.status(204).send(); } catch (error) { next(error); }
}
