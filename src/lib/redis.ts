import IORedis from "ioredis";
import { env } from "./env";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
