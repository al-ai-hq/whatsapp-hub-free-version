import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { CreateListSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Archived lists are hidden unless asked for — they stay out of every picker.
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  const lists = await prisma.contactList.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { memberships: true } } },
  });
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateListSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid name" }, { status: 400 });
  const name = parsed.data.name;

  // Reject case-insensitive duplicates (friendly message).
  const clash = await prisma.contactList.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) return NextResponse.json({ error: `A list named "${name}" already exists.` }, { status: 409 });

  try {
    const list = await prisma.contactList.create({ data: { name } });
    void audit(claims.sub, "list.created", name);
    return NextResponse.json({ list }, { status: 201 });
  } catch (err) {
    // Backstop for the exact-case unique index (e.g. a concurrent create).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `A list named "${name}" already exists.` }, { status: 409 });
    }
    throw err;
  }
}
