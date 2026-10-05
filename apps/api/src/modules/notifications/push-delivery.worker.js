import { env } from "../../config/env.js";
import { recordComponentFailure, recordComponentStarting, recordComponentSuccess } from "../monitoring/monitoring.service.js";
import { notificationsRepository } from "./notifications.repository.js";
import { setPushQueueWakeUp } from "./notifications.service.js";
import { processPushQueue } from "./push-delivery.service.js";

let timer = null, running = null, lastCleanup = 0;
function run() {
  if (running) return running;
  running = processPushQueue().then(async report => {
    if (report.failed) recordComponentFailure("push-delivery", new Error("Falhas de push; confira recibos e credenciais"), report);
    else recordComponentSuccess("push-delivery", report);
    if (Date.now() - lastCleanup > 3_600_000) {
      await notificationsRepository.deleteOldPushJobs(new Date(Date.now() - 7 * 24 * 60 * 60_000));
      lastCleanup = Date.now();
    }
  }).catch(error => recordComponentFailure("push-delivery", error)).finally(() => { running = null; });
  return running;
}
export function startPushDeliveryWorker() {
  if (timer || !env.push.enabled) return;
  recordComponentStarting("push-delivery");
  setPushQueueWakeUp(() => { void run(); });
  timer = setInterval(() => { void run(); }, 5_000);
  timer.unref?.();
  void run();
}
export async function stopPushDeliveryWorker() {
  setPushQueueWakeUp(null);
  if (timer) clearInterval(timer);
  timer = null;
  await running;
}
