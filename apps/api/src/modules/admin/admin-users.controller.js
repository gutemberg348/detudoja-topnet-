import {
  activateAllAdminUserServices,
  adjustAdminUserWallet,
  addAdminUserService,
  approveAdminUserKycWithoutSubmission,
  getAdminUser,
  listAdminUsers,
  creditAdminUserWallet,
  updateAdminUser,
  updateAdminUserPassword,
  updateAdminPayoutAccount,
  updateAdminCourierProfile,
  updateAdminSellerProfile,
  updateAdminUserService,
  updateAdminUserStatus,
} from "./admin-users.service.js";

export async function approveAdminUserKycWithoutSubmissionController(req, res, next) {
  try {
    res.json(await approveAdminUserKycWithoutSubmission(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminUserPasswordController(req, res, next) {
  try {
    res.json(await updateAdminUserPassword(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function activateAllAdminUserServicesController(req, res, next) {
  try {
    res.json(await activateAllAdminUserServices(req.auth.user.id, req.params.userId));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminPayoutAccountController(req, res, next) {
  try {
    res.json(await updateAdminPayoutAccount(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function adjustAdminUserWalletController(req, res, next) {
  try {
    res.json(await adjustAdminUserWallet(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function listAdminUsersController(req, res, next) {
  try {
    res.json(await listAdminUsers(req.query));
  } catch (error) {
    next(error);
  }
}

export async function getAdminUserController(req, res, next) {
  try {
    res.json(await getAdminUser(req.params.userId));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminUserStatusController(req, res, next) {
  try {
    res.json(await updateAdminUserStatus(req.auth.user.id, req.params.userId, req.body.status));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminUserController(req, res, next) {
  try {
    res.json(await updateAdminUser(req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function creditAdminUserWalletController(req, res, next) {
  try {
    res.json(await creditAdminUserWallet(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminSellerProfileController(req, res, next) {
  try {
    res.json(await updateAdminSellerProfile(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminCourierProfileController(req, res, next) {
  try {
    res.json(await updateAdminCourierProfile(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function addAdminUserServiceController(req, res, next) {
  try {
    res.json(await addAdminUserService(req.auth.user.id, req.params.userId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminUserServiceController(req, res, next) {
  try {
    res.json(await updateAdminUserService(req.auth.user.id, req.params.userId, req.params.sellerServiceId, req.body));
  } catch (error) {
    next(error);
  }
}
