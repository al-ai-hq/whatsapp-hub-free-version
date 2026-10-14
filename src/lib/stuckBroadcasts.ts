import { sendJobId } from "./jobId";

/**
 * Selection logic for broadcasts stranded by a failed enqueue.
 *
 * createAndEnqueueBroadcast writes the Broadcast + BroadcastRecipient rows and
 * THEN enqueues. If the enqueue throws (as it did while BullMQ was rejecting
 * job ids containing ":"), the rows survive with PENDING recipients and no job
 * behind them — they can never send.
 *
 * The distinguishing signal is the queue, not the status or age: a genuinely
 * scheduled campaign also sits at PENDING, but its (delayed) job exists in
 * Redis. Kept pure so the guard can be unit-tested — it decides what gets
 * destroyed.
 */
export interface PendingRecipient {
  contactId: string;
}

export interface CandidateBroadcast {
  id: string;
  recipients: PendingRecipient[];
}

export interface StuckReport<T extends CandidateBroadcast> {
  /** No PENDING recipient has a job — safe to fail or delete. */
  stranded: T[];
  /** Some jobs exist, so real work is in flight. Never touched. */
  partial: { broadcast: T; queued: number }[];
}

/**
 * Job ids to probe for one recipient: the current "_" scheme plus the pre-fix
 * ":" scheme, so an older in-flight job still counts as real work.
 */
export function candidateJobIds(broadcastId: string, contactId: string): string[] {
  return [sendJobId(broadcastId, contactId), `${broadcastId}:${contactId}`];
}

/**
 * Split candidates into stranded vs partial. `hasJob` reports whether a
 * recipient has any send job queued.
 *
 * A broadcast with zero PENDING recipients is never stranded — there is
 * nothing to clean up, and treating it as such would delete a finished send.
 */
export function classifyStuck<T extends CandidateBroadcast>(
  candidates: T[],
  hasJob: (broadcastId: string, contactId: string) => boolean,
): StuckReport<T> {
  const stranded: T[] = [];
  const partial: { broadcast: T; queued: number }[] = [];

  for (const broadcast of candidates) {
    if (broadcast.recipients.length === 0) continue;
    const queued = broadcast.recipients.filter((r) => hasJob(broadcast.id, r.contactId)).length;
    if (queued === 0) stranded.push(broadcast);
    else partial.push({ broadcast, queued });
  }

  return { stranded, partial };
}
