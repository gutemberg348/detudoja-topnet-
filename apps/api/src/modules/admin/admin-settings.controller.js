import {
  getSupportSettings,
  updateSupportSettings,
} from "../settings/system-settings.service.js";
import {
  getAdminEarningsSettings,
  updateAdminCategoryFee,
  updateAdminOrderEarningsDistribution,
  updateAdminSegmentFee,
} from "./admin-earnings.service.js";

export async function getAdminSupportSettingsController(_req, res, next) {
  try {
    res.json(await getSupportSettings());
  } catch (error) {
    next(error);
  }
}

export async function updateAdminSupportSettingsController(req, res, next) {
  try {
    res.json(await updateSupportSettings(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function getAdminEarningsSettingsController(_req, res, next) {
  try {
    res.json(await getAdminEarningsSettings());
  } catch (error) {
    next(error);
  }
}

export async function updateAdminCategoryFeeController(req, res, next) {
  try {
    res.json(await updateAdminCategoryFee(req.params.categoryId, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminOrderEarningsDistributionController(req, res, next) {
  try {
    res.json(await updateAdminOrderEarningsDistribution(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function updateAdminSegmentFeeController(req, res, next) {
  try {
    res.json(await updateAdminSegmentFee(req.params.segmentId, req.body));
  } catch (error) {
    next(error);
  }
}
