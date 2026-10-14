import { NextRequest, NextResponse } from "next/server";
import { verifyToken, cookieBase, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { bumpVersion } from "@/lib/tokenStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const claims =
    (await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access")) ??
    (await verifyToken(req.cookies.get(REFRESH_COOKIE)?.value, "refresh"));
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await bumpVersion(claims.sub);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
