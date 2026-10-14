import { prisma } from "./db";
import { normalizeInbound, previewFor, type InboundMessage } from "./inboundMessage";

export type { InboundMessage };

/**
 * Record an inbound customer message into its conversation thread.
 * Idempotent on the message wamid — Meta retries webhooks, and a retry must not
 * double-count unread or duplicate the message.
 */
export async function recordInboundMessage(m: InboundMessage): Promise<void> {
  if (m.id) {
    const existing = await prisma.message.findUnique({ where: { wamid: m.id }, select: { id: true } });
    if (existing) return;
  }

  const n = normalizeInbound(m);
  const preview = previewFor(n);
  const contact = await prisma.contact.findUnique({ where: { phone: m.from }, select: { id: true } });
  const now = new Date();

  const convo = await prisma.conversation.upsert({
    where: { phone: m.from },
    create: {
      phone: m.from, contactId: contact?.id ?? null,
      lastInboundAt: now, lastMessageAt: now, lastPreview: preview, unread: 1,
    },
    update: {
      lastInboundAt: now, lastMessageAt: now, lastPreview: preview,
      unread: { increment: 1 },
      ...(contact ? { contactId: contact.id } : {}),
    },
  });

  await prisma.message.create({
    data: {
      conversationId: convo.id, direction: "IN",
      type: n.type, text: n.text, mediaId: n.mediaId, mediaMime: n.mediaMime,
      mediaFilename: n.mediaFilename, wamid: m.id ?? null,
    },
  });
}
