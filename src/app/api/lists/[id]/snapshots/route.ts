import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snapshotList } from "@/lib/snapshots";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Returns true if the list exists. */
async function listExists(listId: string): Promise<boolean> {
  const list = await prisma.contactList.findUnique({
    where: { id: listId },
    select: { id: true },
  });
  return !!list;
}

/** GET /api/lists/:id/snapshots — list a contact list's snapshots (newest first). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await listExists(id))) return NextResponse.json({ error: "list not found" }, { status: 404 });
  const snapshots = await prisma.contactListSnapshot.findMany({
    where: { listId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, listName: true, memberCount: true, reason: true, createdAt: true },
  });
  return NextResponse.json({ snapshots });
}

/** POST /api/lists/:id/snapshots — take a manual snapshot now. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await listExists(id))) return NextResponse.json({ error: "list not found" }, { status: 404 });
  const snap = await snapshotList(id, "manual");
  if (!snap) return NextResponse.json({ error: "list not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...snap }, { status: 201 });
}
