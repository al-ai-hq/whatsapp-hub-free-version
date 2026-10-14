import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { SendTemplateMessageSchema } from "@/lib/validation";
import { sendTemplate, WhatsAppError } from "@/lib/whatsapp";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const parsed = SendTemplateMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }

  const convo = await prisma.conversation.findFirst({ where: { id }, select: { id: true, phone: true } });
  if (!convo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const template = await prisma.template.findFirst({ where: { id: parsed.data.templateId } });
  if (!template) return NextResponse.json({ error: "template not found" }, { status: 404 });
  if (template.status !== "APPROVED") {
    return NextResponse.json({ error: "template not approved by Meta" }, { status: 422 });
  }
  const rich =
    ["IMAGE", "DOCUMENT", "VIDEO"].includes(template.headerFormat ?? "") ||
    template.copyCode ||
    template.ltoExpiration ||
    (Array.isArray(template.cards) && template.cards.length > 0);
  if (rich) {
    return NextResponse.json(
      { error: "this template needs media/coupon/expiry inputs — send it from a broadcast" },
      { status: 422 },
    );
  }
  const bodyParams = parsed.data.variables.slice(0, template.variableCount);
  if (bodyParams.length < template.variableCount || bodyParams.some((v) => !v)) {
    return NextResponse.json({ error: `fill all ${template.variableCount} template variable(s)` }, { status: 422 });
  }

  let wamid: string;
  try {
    wamid = await sendTemplate({
      to: convo.phone,
      templateName: template.name,
      language: template.language,
      bodyParams,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "send failed";
    const code = e instanceof WhatsAppError ? e.status : 502;
    return NextResponse.json({ error: message }, { status: code });
  }

  const preview = `📋 ${template.name}${bodyParams.length ? ` · ${bodyParams.join(", ")}` : ""}`;
  const created = await prisma.message.create({
    data: { conversationId: id, direction: "OUT", type: "template", text: preview, wamid, status: "SENT" },
  });
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: created.createdAt, lastPreview: preview, unread: 0 },
  });

  void audit(claims.sub, "conversation.template_sent", id, { templateName: template.name });

  return NextResponse.json(
    { message: { id: created.id, direction: "OUT", type: "template", text: preview, status: "SENT", createdAt: created.createdAt } },
    { status: 201 },
  );
}
