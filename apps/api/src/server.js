import { createServer } from "node:http";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { closeRedis, initializeRedis } from "./config/redis.js";
import { log, logError } from "./config/logger.js";
import {
  recordComponentFailure,
  recordComponentStarting,
  recordComponentSuccess,
} from "./modules/monitoring/monitoring.service.js";
import {
  startEarningsReleaseWorker,
  stopEarningsReleaseWorker,
} from "./modules/earnings/earnings-release.worker.js";
import {
  startPayoutWorker,
  stopPayoutWorker,
} from "./modules/payouts/payout.worker.js";
import {
  startWithdrawalWorker,
  stopWithdrawalWorker,
} from "./modules/withdrawals/withdrawal.worker.js";
import {
  startOrderTimeoutWorker,
  stopOrderTimeoutWorker,
} from "./modules/orders/order-timeout.worker.js";
import {
  startAsaasReconciliationWorker,
  stopAsaasReconciliationWorker,
} from "./modules/payments/asaas-reconciliation.worker.js";
import {
  startServiceTimeoutWorker,
  stopServiceTimeoutWorker,
} from "./modules/service-chats/service-timeout.worker.js";
import {
  startKycAnalysisWorker,
  stopKycAnalysisWorker,
} from "./modules/kyc/kyc-analysis.worker.js";
import {
  closeRealtimeServer,
  initRealtimeServer,
} from "./realtime/socket.server.js";

let server;
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  log("info", "api.shutdown_started", { signal });

  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await stopEarningsReleaseWorker();
  await stopOrderTimeoutWorker();
  await stopServiceTimeoutWorker();
  await stopAsaasReconciliationWorker();
  await stopPayoutWorker();
  await stopWithdrawalWorker();
  await stopKycAnalysisWorker();
  await closeRealtimeServer();
  await closeRedis();
  await prisma.$disconnect();
}

async function startServer() {
  recordComponentStarting("api");
  await prisma.$connect();
  await initializeRedis();

  // The HTTP middleware is loaded after Redis so rate limiting is shared by all API instances.
  const { app } = await import("./app.js");

  server = createServer(app);
  await initRealtimeServer(server);
  startEarningsReleaseWorker();
  startOrderTimeoutWorker();
  startServiceTimeoutWorker();
  startAsaasReconciliationWorker();
  startPayoutWorker();
  startWithdrawalWorker();
  startKycAnalysisWorker();

  server.listen(env.port, env.host, () => {
    recordComponentSuccess("api", { host: env.host, port: env.port });
    log("info", "api.started", { host: env.host, port: env.port });
  });
}

process.on("unhandledRejection", (error) => {
  recordComponentFailure("api", error, { source: "unhandledRejection" });
});

process.once("uncaughtException", (error) => {
  recordComponentFailure("api", error, { source: "uncaughtException" });
  logError("api.uncaught_exception", error);
  shutdown("uncaughtException")
    .finally(() => process.exit(1));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Failed to close API cleanly", error);
        process.exit(1);
      });
  });
}

startServer().catch((error) => {
  recordComponentFailure("api", error, { source: "startup" });
  logError("api.startup_failed", error);
  process.exitCode = 1;
});
