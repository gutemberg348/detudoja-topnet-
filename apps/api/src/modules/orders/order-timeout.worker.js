import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";
import { expireUnattendedStoreOrders } from "./order-timeout.service.js";

const ORDER_TIMEOUT_INTERVAL_MS = 60_000;

let interval = null;
let running = null;

async function runOrderTimeoutCycle() {
  if (running) return running;

  running = expireUnattendedStoreOrders()
    .then((result) => {
      for (const failure of result.failed) {
        recordComponentFailure("order-timeout", failure.error, {
          paymentId: failure.paymentId,
        });
      }

      if (result.failed.length === 0) {
        recordComponentSuccess("order-timeout", result);
      }
    })
    .catch((error) => recordComponentFailure("order-timeout", error))
    .finally(() => { running = null; });

  return running;
}

export function startOrderTimeoutWorker() {
  if (interval) return;
  recordComponentStarting("order-timeout");
  void runOrderTimeoutCycle();
  interval = setInterval(() => void runOrderTimeoutCycle(), ORDER_TIMEOUT_INTERVAL_MS);
  interval.unref?.();
}

export async function stopOrderTimeoutWorker() {
  if (interval) clearInterval(interval);
  interval = null;
  await running;
}
