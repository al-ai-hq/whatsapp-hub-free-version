import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  verifyToken, signAccess, signRefresh, cookieBase,
  ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_MAX_AGE, REFRESH_TTL_SECONDS,
} from "@/lib/auth";
import { getVersion, isJtiActive, registerJti, revokeJti, bumpVersion } from "@/lib/tokenStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(REFRESH_COOKIE)?.value, "refresh");
  if (!claims?.sub || !claims.jti || claims.ver === undefined) {
    return unauthorized();
  }

  const currentVer = await getVersion(claims.sub);
  if (claims.ver !== currentVer) return unauthorized();

  if (!(await isJtiActive(claims.jti))) {
    await bumpVersion(claims.sub);
    return unauthorized();
  }

  await revokeJti(claims.jti);
  const newJti = crypto.randomUUID();
  await registerJti(newJti);

  const [access, refresh] = await Promise.all([
    signAccess(claims.sub),
    signRefresh(claims.sub, currentVer, newJti),
  ]);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, access, { ...cookieBase, maxAge: ACCESS_MAX_AGE });
  res.cookies.set(REFRESH_COOKIE, refresh, { ...cookieBase, maxAge: REFRESH_TTL_SECONDS });
  return res;
}

function unauthorized() {
  const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
