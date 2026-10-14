import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendQueue } from "@/lib/queue";
import { sendJobId } from "@/lib/jobId";
import { statusAfterEnqueue } from "@/lib/broadcastStatus";
import { resolveBodyParams, type VariableMap } from "@/lib/broadcast";
import { resolveCarouselCards } from "@/lib/carousel";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/broadcasts/:id/retry
 * Re-enqueues every FAILED recipient: resets them to PENDING, recomputes the
 * template params from the saved variableMap, and queues fresh jobs (new jobId
 * so BullMQ doesn't dedupe against the original completed job).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const broadcast = await prisma.broadcast.findFirst({
    where: { id },
    include: { template: true },
  });
  if (!broadcast) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (broadcast.template.status !== "APPROVED") {
    return NextResponse.json({ error: "template no longer approved" }, { status: 422 });
  }
  // A countdown offer that already expired can't be re-sent — Meta would reject every job.
  if (broadcast.ltoExpiresAt && broadcast.ltoExpiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "the limited-time offer has expired — create a new broadcast" }, { status: 422 });
  }

  // Skip opted-out contacts even on retry.
  const optOuts = new Set(
    (await prisma.optOut.findMany({ select: { phone: true } })).map((o) => o.phone),
  );

  const failed = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: id, status: "FAILED" },
    include: { contact: true },
  });
  const retriable = failed.filter((r) => !r.contact.optedOut && !optOuts.has(r.contact.phone));

  if (retriable.length === 0) {
    return NextResponse.json({ retried: 0, message: "no retriable failed recipients" });
  }

  const variableMap = (broadcast.variableMap ?? []) as VariableMap;
  const stamp = Date.now();

  await prisma.broadcast.update({
    where: { id },
    data: {
      status: "SENDING",
      // these will be re-counted as jobs complete
      failedCount: { decrement: retriable.length },
      completedAt: null,
    },
  });

  let requeued = 0;
  const notQueued: string[] = [];
  let enqueueError: string | null = null;

  for (const rec of retriable) {
    await prisma.broadcastRecipient.update({
      where: { id: rec.id },
      data: { status: "PENDING", error: null, wamid: null },
    });

    try {
      await sendQueue.add(
        "send",
        {
          broadcastId: id,
          recipientId: rec.id,
          to: rec.contact.phone,
          templateName: broadcast.template.name,
          language: broadcast.template.language,
          bodyParams: resolveBodyParams(variableMap, rec.contact),
          headerFormat: broadcast.template.headerFormat,
          headerMediaUrl: broadcast.headerMediaUrl,
          couponCode: broadcast.couponCode,
          carouselCards: resolveCarouselCards(
            broadcast.template.cards,
            (broadcast.cardMediaUrls as string[] | null) ?? null,
          ),
          ltoExpiryMs: broadcast.ltoExpiresAt?.getTime() ?? null,
        },
        { jobId: sendJobId(id, rec.contactId, `r${stamp}`) }, // fresh id avoids dedupe
      );
      requeued++;
    } catch (err) {
      // Put it straight back to FAILED — we already reset it to PENDING and
      // decremented failedCount, so leaving it would strand the broadcast.
      enqueueError ??= err instanceof Error ? err.message : "enqueue failed";
      notQueued.push(rec.id);
    }
  }

  if (notQueued.length > 0) {
    await prisma.broadcastRecipient.updateMany({
      where: { id: { in: notQueued } },
      data: { status: "FAILED", error: `not enqueued: ${enqueueError ?? "unknown error"}` },
    });
    const counts = await prisma.broadcast.update({
      where: { id },
      data: { failedCount: { increment: notQueued.length } },
      select: { totalCount: true, sentCount: true, failedCount: true },
    });
    const settled = statusAfterEnqueue({
      queued: requeued,
      total: counts.totalCount,
      sent: counts.sentCount,
      failed: counts.failedCount,
    });
    if (settled) {
      await prisma.broadcast.updateMany({
        where: { id, status: { in: ["SCHEDULED", "SENDING"] } },
        data: { status: settled, completedAt: new Date() },
      });
    }
  }

  void audit(claims.sub, "broadcast.retried", id, { retried: requeued, failed: notQueued.length });
  if (requeued === 0) {
    return NextResponse.json(
      { retried: 0, error: `could not queue any messages: ${enqueueError ?? "unknown error"}` },
      { status: 503 },
    );
  }
  return NextResponse.json({
    retried: requeued,
    ...(notQueued.length > 0
      ? { failed: notQueued.length, warning: `${notQueued.length} recipient(s) could not be queued: ${enqueueError}` }
      : {}),
  });
}
