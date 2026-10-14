import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.AUTH_JWT_SECRET);

export const ACCESS_COOKIE = "at";
export const REFRESH_COOKIE = "rt";
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7d
export const ACCESS_MAX_AGE = 60 * 15; // 15m

export interface AccessClaims extends JWTPayload {
  sub: string;
  typ: "access";
}

export interface RefreshClaims extends JWTPayload {
  sub: string;
  typ: "refresh";
  ver: number;
  jti: string;
}

export type AuthClaims = AccessClaims | RefreshClaims;

export async function signAccess(sub: string): Promise<string> {
  return new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function signRefresh(sub: string, ver: number, jti: string): Promise<string> {
  return new SignJWT({ typ: "refresh", ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_TTL)
    .sign(secret);
}

export async function verifyToken(
  token: string | undefined,
  typ: "access" | "refresh",
): Promise<AuthClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<AuthClaims>(token, secret);
    if (payload.typ !== typ) return null;
    return payload;
  } catch {
    return null;
  }
}

export const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
