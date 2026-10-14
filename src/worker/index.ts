import { Worker } from "bullmq";
// Relative imports: the worker runs under tsx, which does not resolve tsconfig paths.
import { connection } from "../lib/redis";
import { SEND_QUEUE, type SendJob } from "../lib/queue";
import { RECURRING_QUEUE, type RecurringJob, recurringQueue, upsertSchedule } from "../lib/recurring";
import { createAndEnqueueBroadcast, type VariableMap } from "../lib/broadcast";
import { sendTemplate, WhatsAppError } from "../lib/whatsapp";
import { prisma } from "../lib/db";
import { env } from "../lib/env";

// Rate-limited consumer.
const worker = new Worker<SendJob>(
  SEND_QUEUE,
  async (job) => {
    const { recipientId, to, templateName, language, bodyParams, headerFormat, headerMediaUrl, couponCode, carouselCards, ltoExpiryMs } = job.data;

    // First job of a scheduled broadcast flips it to SENDING.
    await prisma.broadcast.updateMany({
      where: { id: job.data.broadcastId, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: new Date() },
    });

    try {
      const wamid = await sendTemplate({
        to, templateName, language, bodyParams,
        headerFormat, headerMediaUrl, couponCode, carouselCards, ltoExpiryMs,
      });

      await prisma.broadcastRecipient.update({
        where: { id: recipientId },
        data: { status: "SENT", wamid },
      });
      await prisma.broadcast.update({
        where: { id: job.data.broadcastId },
        data: { sentCount: { increment: 1 } },
      });
      return { wamid };
    } catch (err) {
      const retryable = err instanceof WhatsAppError ? err.retryable : true;
      const message = err instanceof Error ? err.message : "unknown error";

      const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!retryable || isFinal) {
        await prisma.broadcastRecipient.update({
          where: { id: recipientId },
          data: { status: "FAILED", error: message },
        });
        await prisma.broadcast.update({
          where: { id: job.data.broadcastId },
          data: { failedCount: { increment: 1 } },
        });
      }
      if (retryable) throw err;
      return { skipped: true, reason: message };
    }
  },
  {
    connection: connection as any,
    concurrency: Math.min(env.WA_MPS, 50),
    limiter: { max: env.WA_MPS, duration: 1000 },
  },
);

// Mark broadcast COMPLETED when its queue drains.
worker.on("completed", async (job) => {
  const { broadcastId } = job.data;
  const b = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (b && b.sentCount + b.failedCount >= b.totalCount && b.status === "SENDING") {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log(`[worker] listening on "${SEND_QUEUE}" @ ${env.WA_MPS} msg/s`);

// ── Recurring campaign scheduler ─────────────────────────────────────
const recurringWorker = new Worker<RecurringJob>(
  RECURRING_QUEUE,
  async (job) => {
    const campaign = await prisma.recurringCampaign.findUnique({ where: { id: job.data.campaignId } });
    if (!campaign || !campaign.active) return { skipped: true };

    const result = await createAndEnqueueBroadcast({
      templateId: campaign.templateId,
      listId: campaign.listId,
      variableMap: (campaign.variableMap ?? []) as VariableMap,
    });
    await prisma.recurringCampaign.update({
      where: { id: campaign.id },
      data: { lastRunAt: new Date() },
    });
    console.log(`[recurring] ${campaign.name}: ${result.ok ? `queued ${result.queued}` : `skipped (${result.error})`}`);
    return result;
  },
  { connection: connection as any },
);
recurringWorker.on("failed", (job, err) => console.error(`[recurring] ${job?.id} failed:`, err.message));

// On boot, re-register schedules for all active campaigns (in case Redis was reset).
(async () => {
  const active = await prisma.recurringCampaign.findMany({ where: { active: true } });
  for (const c of active) await upsertSchedule(c.id, c.cron);
  if (active.length) console.log(`[recurring] synced ${active.length} active schedule(s)`);
})();

// Keep the import referenced even if unused above (queue is created on import).
void recurringQueue;
