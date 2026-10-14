import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { sendReadReceipt } from "@/lib/whatsapp";

export const runtime = "nodejs";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const convo = await prisma.conversation.findFirst({
    where: { id },
    include: { contact: { select: { name: true } } },
  });
  if (!convo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 300,
  });

  if (convo.unread > 0) {
    await prisma.conversation.update({ where: { id }, data: { unread: 0 } });
    const lastIn = await prisma.message.findFirst({
      where: { conversationId: id, direction: "IN", wamid: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { wamid: true },
    });
    if (lastIn?.wamid) await sendReadReceipt(lastIn.wamid);
  }

  const windowOpen = convo.lastInboundAt
    ? Date.now() - new Date(convo.lastInboundAt).getTime() < WINDOW_MS
    : false;

  return NextResponse.json({
    conversation: {
      id: convo.id,
      phone: convo.phone,
      name: convo.contact?.name ?? null,
      lastInboundAt: convo.lastInboundAt,
      windowOpen,
    },
    messages: messages.map((m) => ({
      id: m.id, direction: m.direction, type: m.type, text: m.text,
      mediaMime: m.mediaMime, mediaFilename: m.mediaFilename,
      status: m.status, error: m.error, createdAt: m.createdAt,
    })),
  });
}
