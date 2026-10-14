import { connection } from "./redis";
import { REFRESH_TTL_SECONDS } from "./auth";

const verKey = (sub: string) => `rt:ver:${sub}`;
const jtiKey = (jti: string) => `rt:jti:${jti}`;

export async function getVersion(sub: string): Promise<number> {
  const v = await connection.get(verKey(sub));
  if (v !== null) return Number(v);
  await connection.set(verKey(sub), "1");
  return 1;
}

export async function bumpVersion(sub: string): Promise<number> {
  return connection.incr(verKey(sub));
}

export async function registerJti(jti: string): Promise<void> {
  await connection.set(jtiKey(jti), "1", "EX", REFRESH_TTL_SECONDS);
}

export async function isJtiActive(jti: string): Promise<boolean> {
  return (await connection.exists(jtiKey(jti))) === 1;
}

export async function revokeJti(jti: string): Promise<void> {
  await connection.del(jtiKey(jti));
}
