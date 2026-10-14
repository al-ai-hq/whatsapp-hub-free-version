import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { CreateContactSchema, composeName } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/contacts?query=&optedOut=true|false&offset=0&limit=50
 * Search by phone or name, optional opt-out filter, paginated.
 */
export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const query = sp.get("query")?.trim() ?? "";
  const optedOutParam = sp.get("optedOut");
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 50) || 50));

  const where: Prisma.ContactWhereInput = {
    ...(query
      ? { OR: [{ phone: { contains: query } }, { name: { contains: query, mode: "insensitive" } }] }
      : {}),
    ...(optedOutParam === "true" ? { optedOut: true } : optedOutParam === "false" ? { optedOut: false } : {}),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        memberships: {
          include: { list: { select: { id: true, name: true, archived: true } } },
        },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    page: { offset, limit, total, query, optedOut: optedOutParam },
    contacts: contacts.map((c) => ({
      id: c.id, phone: c.phone, name: c.name, optedOut: c.optedOut,
      attributes: c.attributes, createdAt: c.createdAt,
      // Which lists the contact is in, so the table can show and edit them.
      // Archived lists are included — they are part of the truth, and omitting
      // them would make a row look emptier than it is.
      lists: c.memberships.map((m) => ({
        id: m.list.id, name: m.list.name, archived: m.list.archived,
      })),
    })),
  });
}

/**
 * POST /api/contacts — add a single contact.
 * Body: { firstName, lastName?, phone (E.164 digits), listId?, attributes? }
 * firstName/lastName are stored both as the display `name` and as attributes
 * (so they can be used as {{ }} template variables).
 */
export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { firstName, lastName, phone, listId, listIds, attributes } = parsed.data;
  // `listId` (CSV importer) and `listIds` (the form) mean the same thing here.
  const wantedListIds = [...new Set([...(listIds ?? []), ...(listId ? [listId] : [])])];

  // Reject duplicates explicitly so the single-add UI can show a clear message.
  const existing = await prisma.contact.findFirst({ where: { phone }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "A contact with this phone number already exists.", contactId: existing.id },
      { status: 409 },
    );
  }

  // Validate the lists up front so a bad id is a 400, not a 500.
  if (wantedListIds.length > 0) {
    const owned = await prisma.contactList.findMany({
      where: { id: { in: wantedListIds } },
      select: { id: true },
    });
    if (owned.length !== wantedListIds.length) {
      return NextResponse.json({ error: "List not found" }, { status: 400 });
    }
  }

  const mergedAttributes: Record<string, string> = {
    ...attributes,
    firstName,
    ...(lastName ? { lastName } : {}),
  };

  const contact = await prisma.contact.create({
    data: {
      phone,
      name: composeName(firstName, lastName),
      attributes: mergedAttributes as Prisma.InputJsonValue,
    },
  });

  if (wantedListIds.length > 0) {
    await prisma.contactListMembership.createMany({
      data: wantedListIds.map((id) => ({ contactId: contact.id, listId: id })),
      skipDuplicates: true,
    });
  }

  void audit(claims.sub, "contact.created", contact.phone, wantedListIds.length > 0 ? { listIds: wantedListIds } : undefined);
  return NextResponse.json(
    { ok: true, contact: { id: contact.id, phone: contact.phone, name: contact.name } },
    { status: 201 },
  );
}
