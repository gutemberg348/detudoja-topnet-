import {
  deleteAdminStore,
  getAdminStore,
  listAdminStores,
  updateAdminStore,
} from "./admin-stores.service.js";

export async function listAdminStoresController(req, res, next) {
  try {
    res.json(await listAdminStores(req.query));
  } catch (error) {
    next(error);
  }
}

export async function getAdminStoreController(req, res, next) {
  try {
    res.json(await getAdminStore(req.params.storeId));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminStoreController(req, res, next) {
  try {
    res.json(await updateAdminStore(req.auth.user.id, req.params.storeId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminStoreController(req, res, next) {
  try {
    res.json(await deleteAdminStore(req.params.storeId));
  } catch (error) {
    next(error);
  }
}
