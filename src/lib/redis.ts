import { createClient } from "redis";
import { logger } from "./logger";

type RedisClient = Awaited<
  ReturnType<Awaited<Awaited<ReturnType<typeof createClient>>["connect"]>>
>;

declare global {
  var __REDIS_CLIENT__: RedisClient | undefined;
}

export async function getRedisClient() {
  if (typeof globalThis.__REDIS_CLIENT__ !== "undefined") {
    return globalThis.__REDIS_CLIENT__;
  }

  const { REDIS_URL } = process.env;
  if (!REDIS_URL) {
    return null;
  }

  const { createClient } = await import("redis");
  const client = await createClient({ url: REDIS_URL })
    .on("error", (err) => console.error("Redis Client Error", err))
    .connect();

  logger.info("Connected to Redis");

  globalThis.__REDIS_CLIENT__ = client as any;

  return client;
}
