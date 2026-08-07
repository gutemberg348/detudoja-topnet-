import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__detudojaPrisma ??
  new PrismaClient({
    log: env.nodeEnv === "development" ? ["error", "warn"] : ["error"],
  });

if (env.nodeEnv !== "production") {
  globalForPrisma.__detudojaPrisma = prisma;
}
