import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/audit?offset=0&limit=50 — activity log (newest first). */
export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 50) || 50));

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.auditLog.count(),
  ]);

  return NextResponse.json({
    page: { offset, limit, total },
    entries: entries.map((e) => ({
      id: e.id, actor: e.actor, action: e.action,
      target: e.target, meta: e.meta, createdAt: e.createdAt,
    })),
  });
}
