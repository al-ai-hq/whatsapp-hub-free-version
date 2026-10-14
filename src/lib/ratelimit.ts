import { connection } from "./redis";

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const redisKey = `rl:${key}`;
  try {
    const count = await connection.incr(redisKey);
    if (count === 1) await connection.expire(redisKey, windowSeconds);
    return { allowed: count <= max, remaining: Math.max(0, max - count) };
  } catch {
    return { allowed: true, remaining: max };
  }
}
