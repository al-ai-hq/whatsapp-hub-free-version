import { NextRequest, NextResponse } from "next/server";
import { verifyToken, ACCESS_COOKIE, type AccessClaims } from "@/lib/auth";
import { getAccessContext } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ctx = await getAccessContext(claims as AccessClaims);
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ email: ctx.email });
}
