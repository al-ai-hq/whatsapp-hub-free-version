import { prisma } from "./db";
import { sendQueue } from "./queue";
import { sendJobId } from "./jobId";
import { statusAfterEnqueue } from "./broadcastStatus";
import { resolveCarouselCards } from "./carousel";

// variableMap entries: { from: <field> } (pulls "name" / a contact attribute)
// or { literal: <text> }.
export type VariableMap = ({ from: string } | { literal: string })[];

export function resolveBodyParams(
  variableMap: VariableMap,
  contact: { name: string | null; attributes: unknown },
): string[] {
  const attrs = (contact.attributes ?? {}) as Record<string, string>;
  return variableMap.map((v) =>
    "literal" in v ? v.literal : v.from === "name" ? contact.name ?? "" : attrs[v.from] ?? "",
  );
}

export interface EnqueueResult {
  ok: boolean;
  broadcastId?: string;
  queued?: number;
  /** Recipients whose job could not be queued (already marked FAILED). */
  failed?: number;
  /** Set when SOME recipients failed to queue but the broadcast still runs. */
  warning?: string;
  scheduledAt?: string | null;
  error?: string;
  code?: number;
}

/**
 * Create a broadcast and enqueue one send job per opted-in recipient.
 * Shared by the manual broadcast API and the recurring scheduler so the
 * opt-out filtering, idempotency, and scheduling logic live in one place.
 */
export async function createAndEnqueueBroadcast(opts: {
  templateId: string;
  listId: string;
  variableMap: VariableMap;
  scheduledAt?: Date | null;
  headerMediaUrl?: string | null;
  couponCode?: string | null;
  cardMediaUrls?: string[] | null;
  ltoExpiresAt?: Date | null;
}): Promise<EnqueueResult> {
  const template = await prisma.template.findFirst({ where: { id: opts.templateId } });
  if (!template) return { ok: false, error: "template not found", code: 404 };

  // An archived list is retired: no new sends, including from the recurring
  // scheduler, until someone restores it.
  const list = await prisma.contactList.findFirst({
    where: { id: opts.listId },
    select: { archived: true },
  });
  if (!list) return { ok: false, error: "list not found", code: 404 };
  if (list.archived) return { ok: false, error: "that list is archived — restore it before sending to it", code: 422 };
  if (template.status !== "APPROVED") return { ok: false, error: "template not approved by Meta", code: 422 };

  // A media-header template needs the media supplied for this send.
  const mediaHeader = ["IMAGE", "DOCUMENT", "VIDEO"].includes(template.headerFormat ?? "");
  const headerMediaUrl = mediaHeader ? (opts.headerMediaUrl ?? "").trim() : null;
  if (mediaHeader && !headerMediaUrl) {
    return { ok: false, error: "this template has a media header — provide a media URL", code: 422 };
  }

  // A copy-code (coupon) template needs the code for this send.
  const couponCode = template.copyCode ? (opts.couponCode ?? "").trim() : null;
  if (template.copyCode && !couponCode) {
    return { ok: false, error: "this template has a copy-code button — provide a coupon code", code: 422 };
  }

  // A countdown limited-time offer needs its expiry for this send.
  const ltoExpiresAt = template.ltoExpiration ? (opts.ltoExpiresAt ?? null) : null;
  if (template.ltoExpiration && (!ltoExpiresAt || ltoExpiresAt.getTime() <= Date.now())) {
    return { ok: false, error: "this template is a countdown offer — provide a future expiry time", code: 422 };
  }

  // Carousel cards: template defaults, with any per-broadcast media overrides.
  const cardMediaUrls = Array.isArray(template.cards) ? (opts.cardMediaUrls ?? null) : null;
  const carouselCards = resolveCarouselCards(template.cards, cardMediaUrls);

  const optOuts = new Set(
    (await prisma.optOut.findMany({ select: { phone: true } })).map((o) => o.phone),
  );
  const members = await prisma.contactListMembership.findMany({
    where: { listId: opts.listId },
    include: { contact: true },
  });
  // De-duplicate by contact: totalCount must equal the number of recipient rows
  // that actually exist, or the completion math can never balance.
  const eligible = members
    .map((m) => m.contact)
    .filter((c) => !c.optedOut && !optOuts.has(c.phone));
  const recipients = [...new Map(eligible.map((c) => [c.id, c])).values()];
  if (recipients.length === 0) return { ok: false, error: "no opted-in recipients in list", code: 422 };

  const scheduledAt = opts.scheduledAt ?? null;
  const delayMs = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

  const broadcast = await prisma.broadcast.create({
    data: {
      templateId: opts.templateId,
      listId: opts.listId,
      status: scheduledAt ? "SCHEDULED" : "SENDING",
      totalCount: recipients.length,
      variableMap: opts.variableMap,
      headerMediaUrl,
      couponCode,
      ...(cardMediaUrls ? { cardMediaUrls } : {}),
      ltoExpiresAt,
      scheduledAt,
      startedAt: scheduledAt ? null : new Date(),
    },
  });

  // Create every recipient row up front, then enqueue. Doing it in one pass
  // meant an enqueue error left rows behind with no job and no way to reach
  // them again — the broadcast sat in SENDING forever.
  await prisma.broadcastRecipient.createMany({
    data: recipients.map((c) => ({ broadcastId: broadcast.id, contactId: c.id, status: "PENDING" as const })),
  });
  const rows = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
    select: { id: true, contactId: true },
  });
  const recipientIdByContact = new Map(rows.map((r) => [r.contactId, r.id]));

  let queued = 0;
  const notQueued: string[] = [];
  let enqueueError: string | null = null;

  for (const contact of recipients) {
    const recipientId = recipientIdByContact.get(contact.id);
    if (!recipientId) continue; // row missing (raced deletion) — nothing to send to
    try {
      await sendQueue.add(
        "send",
        {
          broadcastId: broadcast.id,
          recipientId,
          to: contact.phone,
          templateName: template.name,
          language: template.language,
          bodyParams: resolveBodyParams(opts.variableMap, contact),
          headerFormat: template.headerFormat,
          headerMediaUrl,
          couponCode,
          carouselCards,
          ltoExpiryMs: ltoExpiresAt?.getTime() ?? null,
        },
        { jobId: sendJobId(broadcast.id, contact.id), delay: delayMs },
      );
      queued++;
    } catch (err) {
      // Keep going: one rejected job shouldn't abandon the whole broadcast.
      enqueueError ??= err instanceof Error ? err.message : "enqueue failed";
      notQueued.push(recipientId);
    }
  }

  if (notQueued.length > 0) {
    await prisma.broadcastRecipient.updateMany({
      where: { id: { in: notQueued } },
      data: { status: "FAILED", error: `not enqueued: ${enqueueError ?? "unknown error"}` },
    });
    // Read back the post-increment counts; the worker may be moving them too.
    const counts = await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { failedCount: { increment: notQueued.length } },
      select: { totalCount: true, sentCount: true, failedCount: true },
    });
    const settled = statusAfterEnqueue({ queued, total: counts.totalCount, sent: counts.sentCount, failed: counts.failedCount });
    if (settled) {
      // Guarded so a COMPLETED the worker just wrote isn't clobbered.
      await prisma.broadcast.updateMany({
        where: { id: broadcast.id, status: { in: ["SCHEDULED", "SENDING"] } },
        data: { status: settled, completedAt: new Date() },
      });
    }
  }

  if (queued === 0) {
    return {
      ok: false,
      broadcastId: broadcast.id,
      failed: notQueued.length,
      error: `could not queue any messages: ${enqueueError ?? "unknown error"}`,
      code: 503,
    };
  }

  return {
    ok: true,
    broadcastId: broadcast.id,
    queued,
    scheduledAt: scheduledAt?.toISOString() ?? null,
    ...(notQueued.length > 0
      ? { failed: notQueued.length, warning: `${notQueued.length} recipient(s) could not be queued: ${enqueueError}` }
      : {}),
  };
}
