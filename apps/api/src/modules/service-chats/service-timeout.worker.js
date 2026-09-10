import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "../monitoring/monitoring.service.js";
import { expireUnattendedServices } from "./service-timeout.service.js";

const SERVICE_TIMEOUT_INTERVAL_MS = 60_000;

let interval = null;
let running = null;

async function runServiceTimeoutCycle() {
  if (running) return running;
  running = expireUnattendedServices()
    .then((result) => {
      for (const failure of result.failed) {
        recordComponentFailure("service-timeout", failure.error, failure);
      }
      if (result.failed.length === 0) {
        recordComponentSuccess("service-timeout", result);
      }
    })
    .catch((error) => recordComponentFailure("service-timeout", error))
    .finally(() => { running = null; });
  return running;
}

export function startServiceTimeoutWorker() {
  if (interval) return;
  recordComponentStarting("service-timeout");
  void runServiceTimeoutCycle();
  interval = setInterval(() => void runServiceTimeoutCycle(), SERVICE_TIMEOUT_INTERVAL_MS);
  interval.unref?.();
}

export async function stopServiceTimeoutWorker() {
  if (interval) clearInterval(interval);
  interval = null;
  await running;
}
