import { Queue } from "bullmq";
import { connection } from "./redis";

export const RECURRING_QUEUE = "wa-recurring";

export interface RecurringJob { campaignId: string }

export const recurringQueue = new Queue<RecurringJob, any, string>(RECURRING_QUEUE, {
  connection: connection as any,
});

/** Create/replace the cron schedule for a campaign (scheduler id = campaign id). */
export async function upsertSchedule(campaignId: string, cron: string): Promise<void> {
  await recurringQueue.upsertJobScheduler(
    campaignId,
    { pattern: cron, tz: "UTC" },
    { name: "run", data: { campaignId } },
  );
}

/** Remove a campaign's schedule (pause / delete). */
export async function removeSchedule(campaignId: string): Promise<void> {
  await recurringQueue.removeJobScheduler(campaignId).catch(() => {});
}
