import { NextRequest, NextResponse } from "next/server";
import { restoreSnapshot } from "@/lib/snapshots";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/lists/:id/snapshots/:snapshotId/restore — restore the list to a
 *  snapshot (overwrites the list's current membership). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; snapshotId: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, snapshotId } = await ctx.params;
  const list = await prisma.contactList.findFirst({
    where: { id },
    select: { id: true },
  });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });
  const snap = await prisma.contactListSnapshot.findFirst({ where: { id: snapshotId, listId: id }, select: { id: true } });
  if (!snap) return NextResponse.json({ error: "snapshot not found" }, { status: 404 });

  const result = await restoreSnapshot(snapshotId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  void audit(claims.sub, "list.restored", id, { snapshotId });
  return NextResponse.json(result);
}
