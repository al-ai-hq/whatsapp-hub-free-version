import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { listDeleteBlockReason } from "@/lib/listDeletion";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const UpdateListSchema = z.object({ archived: z.boolean() });

/**
 * PATCH /api/lists/:id — archive or restore a list.
 *
 * Archiving is how a list that has already been broadcast to is retired: it
 * leaves every picker and the Lists page, its broadcasts keep their history,
 * and nothing is destroyed. Restoring puts it back.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = UpdateListSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "archived must be true or false" }, { status: 400 });

  const { id } = await ctx.params;
  const list = await prisma.contactList.findFirst({ where: { id }, select: { name: true } });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });

  const { archived } = parsed.data;
  await prisma.contactList.update({ where: { id }, data: { archived } });
  void audit(claims.sub, archived ? "list.archived" : "list.restored", list.name);

  return NextResponse.json({ ok: true, archived });
}

/**
 * DELETE /api/lists/:id — remove a list.
 *
 * Removes the list, its memberships and its snapshots. Contacts are never
 * deleted — they stay in the address book. Refused while a broadcast or a
 * recurring campaign still points at the list.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const list = await prisma.contactList.findFirst({
    where: { id },
    select: { id: true, name: true, _count: { select: { memberships: true } } },
  });
  if (!list) return NextResponse.json({ error: "list not found" }, { status: 404 });

  const [broadcasts, campaigns] = await Promise.all([
    prisma.broadcast.count({ where: { listId: id } }),
    prisma.recurringCampaign.count({ where: { listId: id } }),
  ]);
  const blocked = listDeleteBlockReason(list.name, { broadcasts, campaigns });
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const members = list._count.memberships;
  try {
    await prisma.contactList.delete({ where: { id } });
  } catch (err) {
    // A broadcast created between the count and the delete trips the FK.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: `"${list.name}" was just used by a broadcast — it can no longer be deleted.` },
        { status: 409 },
      );
    }
    throw err;
  }

  void audit(claims.sub, "list.deleted", list.name, { members });
  return NextResponse.json({ ok: true, name: list.name, members });
}
