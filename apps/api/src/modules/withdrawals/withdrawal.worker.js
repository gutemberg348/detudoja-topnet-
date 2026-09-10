import { processPendingWithdrawals } from "./withdrawal.service.js";
import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";

const WITHDRAWAL_INTERVAL_MS = 15_000;
let interval = null;
let running = null;
let pausedForSchemaMismatch = false;

function isSchemaMismatch(error) {
  return error?.code === "P2022"
    || /invalid input value for enum .*StatusSaque/i.test(error?.message || "");
}

async function runCycle() {
  if (running || pausedForSchemaMismatch) return running;
  running = processPendingWithdrawals()
    .then((result) => recordComponentSuccess("withdrawals", result))
    .catch((error) => {
      if (isSchemaMismatch(error)) {
        pausedForSchemaMismatch = true;
        recordComponentFailure("withdrawals", error, { pausedForSchemaMismatch: true });
        return;
      }

      recordComponentFailure("withdrawals", error);
    })
    .finally(() => { running = null; });
  return running;
}

export function startWithdrawalWorker() {
  if (interval) return;
  pausedForSchemaMismatch = false;
  recordComponentStarting("withdrawals");
  void runCycle();
  interval = setInterval(() => void runCycle(), WITHDRAWAL_INTERVAL_MS);
  interval.unref?.();
}

export async function stopWithdrawalWorker() {
  if (interval) clearInterval(interval);
  interval = null;
  pausedForSchemaMismatch = false;
  await running;
}
