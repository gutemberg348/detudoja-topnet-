import {
  getMarketplaceStore,
  listMarketplaceCategories,
  listMarketplaceProducts,
  listMarketplaceSuggestions,
  listMarketplaceStores,
} from "./marketplace.service.js";

export async function listMarketplaceCategoriesController(req, res, next) {
  try {
    res.json(await listMarketplaceCategories(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function listMarketplaceStoresController(req, res, next) {
  try {
    res.json(await listMarketplaceStores(req.auth.user.id, req.query));
  } catch (error) {
    next(error);
  }
}

export async function listMarketplaceProductsController(req, res, next) {
  try {
    res.json(await listMarketplaceProducts(req.auth.user.id, req.query));
  } catch (error) {
    next(error);
  }
}

export async function listMarketplaceSuggestionsController(req, res, next) {
  try {
    res.json(await listMarketplaceSuggestions(req.auth.user.id, req.query));
  } catch (error) {
    next(error);
  }
}

export async function getMarketplaceStoreController(req, res, next) {
  try {
    res.json(await getMarketplaceStore(req.auth.user.id, req.params.storeId));
  } catch (error) {
    next(error);
  }
}
