import { Router } from "express";
import {
  getMarketplaceStoreController,
  listMarketplaceCategoriesController,
  listMarketplaceProductsController,
  listMarketplaceSuggestionsController,
  listMarketplaceStoresController,
} from "../modules/marketplace/marketplace.controller.js";
import {
  marketplaceProductsQuerySchema,
  marketplaceStoresQuerySchema,
  marketplaceSuggestionsQuerySchema,
} from "../modules/marketplace/marketplace.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const marketplaceRoutes = Router();

marketplaceRoutes.get("/categories", listMarketplaceCategoriesController);
marketplaceRoutes.get(
  "/suggestions",
  validate(marketplaceSuggestionsQuerySchema, "query"),
  listMarketplaceSuggestionsController,
);
marketplaceRoutes.get(
  "/products",
  validate(marketplaceProductsQuerySchema, "query"),
  listMarketplaceProductsController,
);
marketplaceRoutes.get(
  "/stores",
  validate(marketplaceStoresQuerySchema, "query"),
  listMarketplaceStoresController,
);
marketplaceRoutes.get("/stores/:storeId", getMarketplaceStoreController);
