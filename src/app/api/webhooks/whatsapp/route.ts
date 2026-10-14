import { NextRequest, NextResponse } from "next/server";
import { optOutKeywords } from "@/lib/env";
import { getWaConfig } from "@/lib/waConfig";
import { WebhookSchema } from "@/lib/validation";
import { verifyWebhookSignature } from "@/lib/webhookSig";
import { recordInboundMessage } from "@/lib/conversations";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const STATUS_MAP = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
} as const;

const TEMPLATE_EVENT_MAP: Record<string, string> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAUSED: "PAUSED",
  DISABLED: "DISABLED",
  FLAGGED: "FLAGGED",
  PENDING: "PENDING",
  PENDING_DELETION: "PENDING_DELETION",
};

/** GET — Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const cfg = await getWaConfig();
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === cfg.webhookVerifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** POST — status callbacks + inbound messages. HMAC-verified. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const cfg = await getWaConfig();

  if (!verifyWebhookSignature(cfg.appSecret, raw, sig)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const parsed = WebhookSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ ok: true });

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const v = change.value;

      // Template approval/rejection — keep local cache in sync.
      if (v.event && v.message_template_name) {
        const status = TEMPLATE_EVENT_MAP[v.event.toUpperCase()] ?? v.event.toUpperCase();
        await prisma.template.updateMany({
          where: {
            name: v.message_template_name,
            ...(v.message_template_language ? { language: v.message_template_language } : {}),
          },
          data: { status },
        });
      }

      // Delivery status updates
      for (const s of change.value.statuses ?? []) {
        const recipient = await prisma.broadcastRecipient.findUnique({ where: { wamid: s.id } });
        if (recipient) {
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: STATUS_MAP[s.status],
              error: s.errors?.[0]?.title ?? recipient.error,
            },
          });
        }
        await prisma.messageEvent.create({
          data: { recipientId: recipient?.id, wamid: s.id, type: `status:${s.status}`, payload: s },
        });
        await prisma.message.updateMany({
          where: { wamid: s.id },
          data: { status: STATUS_MAP[s.status], error: s.errors?.[0]?.title ?? undefined },
        });
      }

      // Inbound messages
      for (const m of change.value.messages ?? []) {
        const clickLabel =
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          null;

        if (clickLabel != null) {
          const ctxId = m.context?.id;
          const recipient = ctxId
            ? await prisma.broadcastRecipient.findUnique({ where: { wamid: ctxId } })
            : null;
          await prisma.messageEvent.create({
            data: {
              recipientId: recipient?.id,
              wamid: ctxId ?? null,
              type: "click",
              payload: { label: clickLabel, from: m.from, raw: m },
            },
          });
        } else {
          await prisma.messageEvent.create({ data: { wamid: null, type: "inbound", payload: m } });
        }

        // Thread into two-way inbox (no clientId).
        await recordInboundMessage(m);

        // Opt-out keyword handling
        const text = m.text?.body?.trim().toUpperCase() ?? "";
        if (optOutKeywords.includes(text)) {
          await prisma.optOut.upsert({
            where: { phone: m.from },
            create: { phone: m.from, source: "keyword" },
            update: {},
          });
          await prisma.contact.updateMany({ where: { phone: m.from }, data: { optedOut: true } });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
