import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { env } from "./env.js";

let redisClient = null;
let socketPublisher = null;
let socketSubscriber = null;

function createRedisClient() {
  const client = new Redis(env.redis.url, {
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  });

  client.on("error", (error) => {
    console.error(`[redis] ${error.message}`);
  });

  return client;
}

async function closeClient(client) {
  if (!client) return;

  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

export function getRedisClient() {
  return redisClient?.status === "ready" ? redisClient : null;
}

export function isRedisReady() {
  return Boolean(getRedisClient());
}

export async function initializeRedis() {
  if (!env.redis.url) {
    if (env.redis.required) {
      throw new Error("REDIS_URL is required in this environment");
    }

    console.warn("[redis] Disabled: REDIS_URL was not configured.");
    return null;
  }

  const client = createRedisClient();

  try {
    await client.connect();
    await client.ping();
    redisClient = client;
    console.log("[redis] Connected.");
    return redisClient;
  } catch (error) {
    await closeClient(client);

    if (env.redis.required) {
      throw new Error(`Unable to connect to Redis: ${error.message}`);
    }

    console.warn("[redis] Unavailable. Using local memory for cache and rate limits.");
    return null;
  }
}

export async function createSocketIoRedisAdapter() {
  const client = getRedisClient();

  if (!client) {
    return null;
  }

  socketPublisher = client.duplicate({ lazyConnect: true });
  socketSubscriber = client.duplicate({ lazyConnect: true });

  socketPublisher.on("error", (error) => {
    console.error(`[redis socket publisher] ${error.message}`);
  });
  socketSubscriber.on("error", (error) => {
    console.error(`[redis socket subscriber] ${error.message}`);
  });

  try {
    await Promise.all([socketPublisher.connect(), socketSubscriber.connect()]);
    return createAdapter(socketPublisher, socketSubscriber);
  } catch (error) {
    await Promise.all([closeClient(socketPublisher), closeClient(socketSubscriber)]);
    socketPublisher = null;
    socketSubscriber = null;

    if (env.redis.required) {
      throw new Error(`Unable to create the Socket.IO Redis adapter: ${error.message}`);
    }

    console.warn("[redis] Socket.IO is running in single-instance mode.");
    return null;
  }
}

export async function closeRedis() {
  await Promise.all([
    closeClient(socketPublisher),
    closeClient(socketSubscriber),
    closeClient(redisClient),
  ]);

  socketPublisher = null;
  socketSubscriber = null;
  redisClient = null;
}
