import {
  approveWithdrawal,
  cancelWithdrawal,
  getWithdrawalOverview,
  listAdminWithdrawals,
  reconcileWithdrawal,
  rejectWithdrawal,
  requestWithdrawal,
} from "./withdrawal.service.js";
import {
  getWithdrawalSettings,
  updateWithdrawalSettings,
} from "./withdrawal.config.js";
import {
  getPayoutAccount,
  savePayoutAccount,
} from "../payouts/payout.service.js";

export async function getWithdrawalOverviewController(req, res, next) {
  try { res.json(await getWithdrawalOverview(req.auth.user.id)); } catch (error) { next(error); }
}

export async function requestWithdrawalController(req, res, next) {
  try { res.status(201).json(await requestWithdrawal(req.auth.user.id, req.body)); } catch (error) { next(error); }
}

export async function cancelWithdrawalController(req, res, next) {
  try { res.json(await cancelWithdrawal(req.auth.user.id, req.params.withdrawalId)); } catch (error) { next(error); }
}

export async function getWithdrawalPixAccountController(req, res, next) {
  try { res.json(await getPayoutAccount(req.auth.user.id)); } catch (error) { next(error); }
}

export async function saveWithdrawalPixAccountController(req, res, next) {
  try { res.json(await savePayoutAccount(req.auth.user.id, req.body)); } catch (error) { next(error); }
}

export async function listAdminWithdrawalsController(req, res, next) {
  try { res.json(await listAdminWithdrawals(req.query)); } catch (error) { next(error); }
}

export async function approveWithdrawalController(req, res, next) {
  try { res.json(await approveWithdrawal(req.auth.user.id, req.params.withdrawalId)); } catch (error) { next(error); }
}

export async function rejectWithdrawalController(req, res, next) {
  try { res.json(await rejectWithdrawal(req.auth.user.id, req.params.withdrawalId, req.body.reason)); } catch (error) { next(error); }
}

export async function refreshWithdrawalController(req, res, next) {
  try {
    await reconcileWithdrawal(Number(req.params.withdrawalId));
    res.json(await listAdminWithdrawals({ limit: 200 }));
  } catch (error) { next(error); }
}

export async function getWithdrawalSettingsController(_req, res, next) {
  try { res.json({ settings: await getWithdrawalSettings() }); } catch (error) { next(error); }
}

export async function updateWithdrawalSettingsController(req, res, next) {
  try { res.json({ settings: await updateWithdrawalSettings(req.auth.user.id, req.body) }); } catch (error) { next(error); }
}
