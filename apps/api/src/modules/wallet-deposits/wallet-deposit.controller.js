import { refreshPendingAsaasWalletDeposit } from "../payments/asaas.service.js";
import { createWalletDeposit, getWalletDeposit } from "./wallet-deposit.service.js";

export async function createWalletDepositController(req, res, next) {
  try {
    res.status(201).json(await createWalletDeposit(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function getWalletDepositController(req, res, next) {
  try {
    res.json(await getWalletDeposit(req.auth.user.id, req.params.depositId));
  } catch (error) {
    next(error);
  }
}

export async function refreshWalletDepositController(req, res, next) {
  try {
    const result = await refreshPendingAsaasWalletDeposit(req.auth.user.id, req.params.depositId);
    res.json({ ...result, ...(await getWalletDeposit(req.auth.user.id, req.params.depositId)) });
  } catch (error) {
    next(error);
  }
}
