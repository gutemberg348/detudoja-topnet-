import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
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
  console.log(`${signal} received. Closing API.`);

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

  await closeRealtimeServer();
  await prisma.$disconnect();
}

async function startServer() {
  await prisma.$connect();

  server = createServer(app);
  initRealtimeServer(server);

  server.listen(env.port, env.host, () => {
    console.log(`API running on http://${env.host}:${env.port}`);
  });
}

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
  console.error("Failed to start API", error);
  process.exitCode = 1;
});
