import {
  addStoreCourier,
  getCourierProfile,
  listStoreCourierTeam,
  removeStoreCourier,
  saveCourierProfile,
  updateCourierDispatchScope,
} from "./courier.service.js";
import {
  acceptCourierRequest,
  cancelCourierRequest,
  createCustomerCourierRequest,
  createCourierRequest,
  getCustomerCourierRequestState,
  getStoreCourierDispatch,
  listCourierRequests,
} from "./courier-dispatch.service.js";

export async function getCourierProfileController(req, res, next) {
  try {
    res.json(await getCourierProfile(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function saveCourierProfileController(req, res, next) {
  try {
    res.json(await saveCourierProfile(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateCourierDispatchScopeController(req, res, next) {
  try {
    res.json(await updateCourierDispatchScope(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function listStoreCourierTeamController(req, res, next) {
  try {
    res.json(await listStoreCourierTeam(req.auth.user.id, req.params.storeId));
  } catch (error) {
    next(error);
  }
}

export async function addStoreCourierController(req, res, next) {
  try {
    res.status(201).json(await addStoreCourier(req.auth.user.id, req.params.storeId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function removeStoreCourierController(req, res, next) {
  try {
    res.json(await removeStoreCourier(req.auth.user.id, req.params.storeId, req.params.memberId));
  } catch (error) {
    next(error);
  }
}

export async function getStoreCourierDispatchController(req, res, next) {
  try { res.json(await getStoreCourierDispatch(req.auth.user.id, req.params.storeId, req.query.serviceTypeId)); } catch (error) { next(error); }
}

export async function createCourierRequestController(req, res, next) {
  try { res.status(201).json(await createCourierRequest(req.auth.user.id, req.params.storeId, req.body)); } catch (error) { next(error); }
}

export async function listCourierRequestsController(req, res, next) {
  try { res.json(await listCourierRequests(req.auth.user.id)); } catch (error) { next(error); }
}

export async function acceptCourierRequestController(req, res, next) {
  try { res.json(await acceptCourierRequest(req.auth.user.id, req.params.requestId)); } catch (error) { next(error); }
}

export async function cancelCourierRequestController(req, res, next) {
  try { res.json(await cancelCourierRequest(req.auth.user.id, req.params.requestId)); } catch (error) { next(error); }
}

export async function getCustomerCourierRequestStateController(req, res, next) {
  try { res.json(await getCustomerCourierRequestState(req.auth.user.id, req.query.serviceTypeId)); } catch (error) { next(error); }
}

export async function createCustomerCourierRequestController(req, res, next) {
  try { res.status(201).json(await createCustomerCourierRequest(req.auth.user.id, req.body)); } catch (error) { next(error); }
}
