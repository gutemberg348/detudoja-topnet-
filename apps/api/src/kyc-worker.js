import { prisma } from "./config/prisma.js";
import { log, logError } from "./config/logger.js";
import {
  startKycAnalysisWorker,
  stopKycAnalysisWorker,
} from "./modules/kyc/kyc-analysis.worker.js";

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "kyc.worker_shutdown_started", { signal });
  await stopKycAnalysisWorker();
  await prisma.$disconnect();
}

async function start() {
  await prisma.$connect();
  startKycAnalysisWorker({ keepAlive: true });
  log("info", "kyc.worker_started");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        logError("kyc.worker_shutdown_failed", error);
        process.exit(1);
      });
  });
}

start().catch((error) => {
  logError("kyc.worker_startup_failed", error);
  process.exitCode = 1;
});
