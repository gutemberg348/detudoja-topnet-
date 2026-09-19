import {
  acceptStoreStaffInvite,
  createStoreStaffInvite,
  declineStoreStaffInvite,
  getMyStoreWorkplaces,
  getStoreTeam,
  revokeStoreMember,
  updateStoreMemberPermissions,
} from "./store-staff.service.js";

export async function getStoreTeamController(req, res, next) {
  try { res.json(await getStoreTeam(req.auth.user.id, req.params.storeId)); } catch (error) { next(error); }
}

export async function createStoreStaffInviteController(req, res, next) {
  try { res.status(201).json(await createStoreStaffInvite(req.auth.user.id, req.params.storeId, req.body)); } catch (error) { next(error); }
}

export async function getMyStoreWorkplacesController(req, res, next) {
  try { res.json(await getMyStoreWorkplaces(req.auth.user.id)); } catch (error) { next(error); }
}

export async function acceptStoreStaffInviteController(req, res, next) {
  try { res.json(await acceptStoreStaffInvite(req.auth.user.id, req.body)); } catch (error) { next(error); }
}

export async function declineStoreStaffInviteController(req, res, next) {
  try { res.json(await declineStoreStaffInvite(req.auth.user.id, req.params.invitationId)); } catch (error) { next(error); }
}

export async function revokeStoreMemberController(req, res, next) {
  try { res.json(await revokeStoreMember(req.auth.user.id, req.params.storeId, req.params.memberId)); } catch (error) { next(error); }
}

export async function updateStoreMemberPermissionsController(req, res, next) {
  try {
    res.json(await updateStoreMemberPermissions(
      req.auth.user.id,
      req.params.storeId,
      req.params.memberId,
      req.body,
    ));
  } catch (error) { next(error); }
}
