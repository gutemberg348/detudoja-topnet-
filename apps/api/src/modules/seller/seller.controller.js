import {
  createAutonomousSale,
  createStoreOrderMessage,
  createStoreOrderProposal,
  createStoreProduct,
  createSellerStore,
  createSellerOnboarding,
  deleteSellerStore,
  deleteStoreProduct,
  getSellerProfile,
  listStoreOrderMessages,
  listSellerStoreCategories,
  listSellerSegments,
  updateSellerStore,
  updateSellerStoreMedia,
  updateStoreOrderStatus,
  updateStoreProduct,
} from "./seller.service.js";

export async function listSellerSegmentsController(_req, res, next) {
  try {
    res.json(await listSellerSegments());
  } catch (error) {
    next(error);
  }
}

export async function getSellerProfileController(req, res, next) {
  try {
    res.json(await getSellerProfile(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function listSellerStoreCategoriesController(_req, res, next) {
  try {
    res.json(await listSellerStoreCategories());
  } catch (error) {
    next(error);
  }
}

export async function createSellerOnboardingController(req, res, next) {
  try {
    res.status(201).json(await createSellerOnboarding(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function createSellerStoreController(req, res, next) {
  try {
    res.status(201).json(await createSellerStore(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateSellerStoreController(req, res, next) {
  try {
    res.json(await updateSellerStore(req.auth.user.id, req.params.storeId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteSellerStoreController(req, res, next) {
  try {
    res.json(await deleteSellerStore(req.auth.user.id, req.params.storeId));
  } catch (error) {
    next(error);
  }
}

export async function updateSellerStoreMediaController(req, res, next) {
  try {
    const files = req.files ?? {};

    res.json(
      await updateSellerStoreMedia(req.auth.user.id, req.params.storeId, req.body, {
        banner: files.banner?.[0] ?? null,
        logo: files.logo?.[0] ?? null,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function createStoreProductController(req, res, next) {
  try {
    res
      .status(201)
      .json(
        await createStoreProduct(
          req.auth.user.id,
          req.params.storeId,
          req.body,
          req.file ?? null,
        ),
      );
  } catch (error) {
    next(error);
  }
}

export async function updateStoreProductController(req, res, next) {
  try {
    res.json(
      await updateStoreProduct(
        req.auth.user.id,
        req.params.storeId,
        req.params.productId,
        req.body,
        req.file ?? null,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function deleteStoreProductController(req, res, next) {
  try {
    res.json(
      await deleteStoreProduct(
        req.auth.user.id,
        req.params.storeId,
        req.params.productId,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function updateStoreOrderStatusController(req, res, next) {
  try {
    res.json(
      await updateStoreOrderStatus(
        req.auth.user.id,
        req.params.storeId,
        req.params.orderId,
        req.body.status,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function listStoreOrderMessagesController(req, res, next) {
  try {
    res.json(
      await listStoreOrderMessages(
        req.auth.user.id,
        req.params.storeId,
        req.params.orderId,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function createStoreOrderMessageController(req, res, next) {
  try {
    res
      .status(201)
      .json(
        await createStoreOrderMessage(
          req.auth.user.id,
          req.params.storeId,
          req.params.orderId,
          req.body,
        ),
      );
  } catch (error) {
    next(error);
  }
}

export async function createStoreOrderProposalController(req, res, next) {
  try {
    res.status(201).json(
      await createStoreOrderProposal(
        req.auth.user.id,
        req.params.storeId,
        req.params.orderId,
        req.body,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function createAutonomousSaleController(req, res, next) {
  try {
    res.status(201).json(await createAutonomousSale(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}
