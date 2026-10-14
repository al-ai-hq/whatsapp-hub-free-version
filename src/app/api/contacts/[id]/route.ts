import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PhoneSchema, ListIdsSchema, diffListMembership } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// All fields optional — used both for the opt-out toggle and for editing details.
const PatchSchema = z
  .object({
    optedOut: z.boolean().optional(),
    name: z.string().trim().max(120).optional(),
    phone: PhoneSchema.optional(),
    // The lists the operator ticked. Reconciled only against the lists the
    // picker could have offered — see the membership block below.
    listIds: ListIdsSchema.optional(),
  })
  .refine(
    (o) =>
      o.optedOut !== undefined ||
      o.name !== undefined ||
      o.phone !== undefined ||
      o.listIds !== undefined,
    { message: "Nothing to update" },
  );

/**
 * PATCH /api/contacts/:id — edit a contact (name/phone) and/or toggle opt-out.
 * Keeps the OptOut table in sync (broadcast enqueue checks both).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({ where: { id } });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { optedOut, name, phone, listIds } = parsed.data;

  // Reject a phone change that would collide with another contact.
  if (phone !== undefined && phone !== contact.phone) {
    const clash = await prisma.contact.findFirst({ where: { phone }, select: { id: true } });
    if (clash) {
      return NextResponse.json({ error: "Another contact already uses this phone number." }, { status: 409 });
    }
  }

  const data: Prisma.ContactUpdateInput = {};
  if (name !== undefined) data.name = name === "" ? null : name;
  if (phone !== undefined) data.phone = phone;
  if (optedOut !== undefined) data.optedOut = optedOut;

  const updated = await prisma.contact.update({ where: { id }, data });

  // Mirror opt-out into the OptOut table. If the phone also changed, drop the
  // stale row under the old number first so both tables stay consistent.
  if (phone !== undefined && phone !== contact.phone) {
    await prisma.optOut.deleteMany({ where: { phone: contact.phone } });
  }
  if (optedOut !== undefined || (phone !== undefined && phone !== contact.phone)) {
    if (updated.optedOut) {
      const existing = await prisma.optOut.findFirst({ where: { phone: updated.phone }, select: { id: true } });
      if (!existing) await prisma.optOut.create({ data: { phone: updated.phone, source: "manual" } });
    } else {
      await prisma.optOut.deleteMany({ where: { phone: updated.phone } });
    }
  }

  // Membership. The picker only ever offers non-archived lists,
  // so reconcile strictly within that set: a list the operator could not see —
  // an archived one it still belongs to — is left alone
  // rather than being removed by an unticked box it never had.
  let membershipChange: { add: string[]; remove: string[] } | null = null;
  if (listIds !== undefined) {
    const [selectable, current] = await Promise.all([
      prisma.contactList.findMany({ where: { archived: false }, select: { id: true } }),
      prisma.contactListMembership.findMany({ where: { contactId: id }, select: { listId: true } }),
    ]);

    const { add, remove } = diffListMembership(
      current.map((m) => m.listId),
      listIds,
      selectable.map((l) => l.id),
    );

    if (remove.length > 0) {
      await prisma.contactListMembership.deleteMany({
        where: { contactId: id, listId: { in: remove } },
      });
    }
    if (add.length > 0) {
      await prisma.contactListMembership.createMany({
        data: add.map((listId) => ({ contactId: id, listId })),
        skipDuplicates: true,
      });
    }
    if (add.length > 0 || remove.length > 0) membershipChange = { add, remove };
  }

  void audit(claims.sub, "contact.updated", updated.phone, {
    ...(membershipChange ? { lists: membershipChange } : {}),
    ...(name !== undefined ? { name: updated.name } : {}),
    ...(phone !== undefined ? { previousPhone: contact.phone } : {}),
    ...(optedOut !== undefined ? { optedOut } : {}),
  });
  // Return the memberships as they now stand so the row can re-render from the
  // server's view rather than the client guessing what it just changed.
  const lists = await prisma.contactListMembership.findMany({
    where: { contactId: id },
    include: { list: { select: { id: true, name: true, archived: true } } },
  });

  return NextResponse.json({
    ok: true,
    contact: {
      id: updated.id,
      phone: updated.phone,
      name: updated.name,
      optedOut: updated.optedOut,
      lists: lists.map((m) => ({ id: m.list.id, name: m.list.name, archived: m.list.archived })),
    },
  });
}

/** DELETE /api/contacts/:id */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const contact = await prisma.contact.findFirst({ where: { id }, select: { phone: true } });
  const r = await prisma.contact.deleteMany({ where: { id } }).catch(() => null);
  if (r && r.count > 0) void audit(claims.sub, "contact.deleted", contact?.phone ?? id);
  return NextResponse.json({ ok: true });
}
