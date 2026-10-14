import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const conversations = await prisma.conversation.findMany({
    where: q
      ? {
          OR: [
            { phone: { contains: q.replace(/[^\d]/g, "") || q } },
            { contact: { name: { contains: q, mode: "insensitive" } } },
            { lastPreview: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: { contact: { select: { name: true } } },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      phone: c.phone,
      name: c.contact?.name ?? null,
      lastPreview: c.lastPreview,
      lastMessageAt: c.lastMessageAt,
      lastInboundAt: c.lastInboundAt,
      unread: c.unread,
    })),
  });
}
