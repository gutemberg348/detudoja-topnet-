import { createHash } from "node:crypto";
import { getRedisClient } from "../../config/redis.js";

const cachePrefix = "detudoja:cache:v1:";

export function createCacheKey(namespace, value) {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return `${cachePrefix}${namespace}:${digest}`;
}

export async function getOrSetJsonCache({ key, load, ttlSeconds }) {
  const redis = getRedisClient();

  if (!redis) {
    return load();
  }

  try {
    const cached = await redis.get(key);

    if (cached !== null) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn(`[cache] Read skipped: ${error.message}`);
  }

  const value = await load();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.warn(`[cache] Write skipped: ${error.message}`);
  }

  return value;
}
