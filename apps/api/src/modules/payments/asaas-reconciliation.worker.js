import { reconcilePendingAsaasPayments } from "./asaas.service.js";
import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";

const RECONCILIATION_INTERVAL_MS = 15_000;

let interval = null;
let running = null;

async function runReconciliationCycle() {
  if (running) return running;

  running = reconcilePendingAsaasPayments()
    .then((result) => recordComponentSuccess("asaas-payment-reconciliation", result))
    .catch((error) => recordComponentFailure("asaas-payment-reconciliation", error))
    .finally(() => { running = null; });

  return running;
}

export function startAsaasReconciliationWorker() {
  if (interval) return;
  recordComponentStarting("asaas-payment-reconciliation");
  void runReconciliationCycle();
  interval = setInterval(() => void runReconciliationCycle(), RECONCILIATION_INTERVAL_MS);
  interval.unref?.();
}

export async function stopAsaasReconciliationWorker() {
  if (interval) clearInterval(interval);
  interval = null;
  await running;
}
