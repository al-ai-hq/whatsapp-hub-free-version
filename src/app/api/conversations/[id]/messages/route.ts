import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { SendMessageSchema } from "@/lib/validation";
import { sendText, WhatsAppError } from "@/lib/whatsapp";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const parsed = SendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }

  const convo = await prisma.conversation.findFirst({ where: { id }, select: { id: true, phone: true } });
  if (!convo) return NextResponse.json({ error: "not found" }, { status: 404 });

  let wamid: string;
  try {
    wamid = await sendText({ to: convo.phone, body: parsed.data.text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "send failed";
    const code = e instanceof WhatsAppError ? e.status : 502;
    return NextResponse.json({ error: message }, { status: code });
  }

  const created = await prisma.message.create({
    data: { conversationId: id, direction: "OUT", type: "text", text: parsed.data.text, wamid, status: "SENT" },
  });
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: created.createdAt, lastPreview: parsed.data.text, unread: 0 },
  });

  void audit(claims.sub, "conversation.text_sent", id);

  return NextResponse.json({
    message: { id: created.id, direction: "OUT", type: "text", text: created.text, status: "SENT", createdAt: created.createdAt },
  }, { status: 201 });
}
