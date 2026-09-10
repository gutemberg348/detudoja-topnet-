import { processPendingPayouts } from "./payout.service.js";
import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";

const PAYOUT_INTERVAL_MS = 15_000;

let interval = null;
let running = null;

async function runPayoutCycle() {
  if (running) return running;

  running = processPendingPayouts()
    .then((result) => recordComponentSuccess("pix-payout", result))
    .catch((error) => recordComponentFailure("pix-payout", error))
    .finally(() => { running = null; });

  return running;
}

export function startPayoutWorker() {
  if (interval) return;
  recordComponentStarting("pix-payout");
  void runPayoutCycle();
  interval = setInterval(() => void runPayoutCycle(), PAYOUT_INTERVAL_MS);
  interval.unref?.();
}

export async function stopPayoutWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  await running;
}
