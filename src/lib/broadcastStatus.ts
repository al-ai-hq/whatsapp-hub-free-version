/**
 * What a broadcast's status should become once an enqueue attempt has finished.
 *
 * Why this is not just the worker's job: the worker marks a broadcast COMPLETED
 * from its "completed" event, when sent + failed >= total. If some recipients
 * never got a job, no further event can ever fire — so whoever records those
 * failures has to settle the broadcast itself, or it sits in SENDING forever.
 * That is exactly how the BullMQ job-id outage stranded 8 broadcasts.
 *
 * Pure so the decision can be unit-tested; the caller applies it.
 */
export interface EnqueueCounts {
  /** Recipients whose job made it onto the queue. */
  queued: number;
  total: number;
  sent: number;
  failed: number;
}

/** The status to write, or null to leave the broadcast alone. */
export type SettledStatus = "FAILED" | "COMPLETED" | null;

export function statusAfterEnqueue(counts: EnqueueCounts): SettledStatus {
  // Nothing reached the queue — nothing will ever send.
  if (counts.queued === 0) return "FAILED";
  // Everything is accounted for. Covers the race where the jobs that *did*
  // queue all finished before the failures were recorded, so the worker's own
  // completion check already ran and came up short.
  if (counts.sent + counts.failed >= counts.total) return "COMPLETED";
  // Work still in flight (or scheduled for later) — the worker will settle it.
  return null;
}
