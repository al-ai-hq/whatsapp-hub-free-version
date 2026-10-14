import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LeadSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const LEADS_LIST_NAME = "Website Leads";

/**
 * POST /api/leads — public lead capture (no auth; middleware allowlists this path).
 * The lead becomes a Contact in the "Website Leads" list.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await rateLimit(`lead:${ip}`, 5, 600);
  if (!rl.allowed) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const parsed = LeadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const { name, phone, business, website } = parsed.data;

  // Honeypot filled → bot. Pretend success, store nothing.
  if (website && website.trim() !== "") return NextResponse.json({ ok: true });

  let list = await prisma.contactList.findFirst({
    where: { name: { equals: LEADS_LIST_NAME, mode: "insensitive" } },
    select: { id: true },
  });
  list ??= await prisma.contactList.create({ data: { name: LEADS_LIST_NAME }, select: { id: true } });

  const existing = await prisma.contact.findFirst({ where: { phone } });
  const attributes: Record<string, string> = {
    ...((existing?.attributes ?? {}) as Record<string, string>),
    firstName: name,
    source: "landing",
    ...(business ? { business } : {}),
  };
  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: { name, attributes: attributes as Prisma.InputJsonValue },
      })
    : await prisma.contact.create({
        data: { phone, name, attributes: attributes as Prisma.InputJsonValue },
      });

  await prisma.contactListMembership.upsert({
    where: { contactId_listId: { contactId: contact.id, listId: list.id } },
    create: { contactId: contact.id, listId: list.id },
    update: {},
  });

  await prisma.auditLog
    .create({
      data: {
        actor: "landing-page", action: "lead.created", target: phone,
        meta: { name, ...(business ? { business } : {}) },
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
