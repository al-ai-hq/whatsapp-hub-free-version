/**
 * Clean up broadcasts stranded by a failed enqueue.
 *
 *   npm run cleanup:stuck                 # dry run
 *   npm run cleanup:stuck -- --apply      # mark them FAILED
 *   npm run cleanup:stuck -- --apply --delete   # delete the rows
 *
 * Run under tsx. Relative imports, not "@/..." — tsx does not resolve tsconfig paths.
 */
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { classifyStuck, candidateJobIds, type CandidateBroadcast } from "../src/lib/stuckBroadcasts";

const apply = process.argv.includes("--apply");
const hardDelete = process.argv.includes("--delete");

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL ?? "", { maxRetriesPerRequest: null });
const sendQueue = new Queue("wa-send", { connection: connection as any });

type Candidate = CandidateBroadcast & {
  status: string;
  createdAt: Date;
  recipients: { contactId: string }[];
};

async function main(): Promise<void> {
  const candidates: Candidate[] = await prisma.broadcast.findMany({
    where: {
      status: { in: ["SCHEDULED", "QUEUED", "SENDING"] },
      recipients: { some: { status: "PENDING" } },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      recipients: { where: { status: "PENDING" }, select: { contactId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const queued = new Set<string>();
  for (const b of candidates) {
    for (const r of b.recipients) {
      const jobs = await Promise.all(candidateJobIds(b.id, r.contactId).map((id) => sendQueue.getJob(id)));
      if (jobs.some(Boolean)) queued.add(`${b.id}|${r.contactId}`);
    }
  }

  const { stranded, partial } = classifyStuck(candidates, (id, contactId) =>
    queued.has(`${id}|${contactId}`),
  );

  console.log(`Scanned ${candidates.length} broadcast(s) with PENDING recipients.`);
  for (const b of stranded) {
    console.log(
      `  STRANDED ${b.id}  status=${b.status}  pending=${b.recipients.length}  created=${b.createdAt.toISOString()}`,
    );
  }
  for (const p of partial) {
    console.log(
      `  SKIP     ${p.broadcast.id}  status=${p.broadcast.status}  ${p.queued}/${p.broadcast.recipients.length} pending recipients still queued`,
    );
  }

  const totalRecipients = stranded.reduce((n, b) => n + b.recipients.length, 0);

  if (stranded.length === 0) {
    console.log("Nothing stranded. No changes.");
    return;
  }
  if (!apply) {
    console.log(
      `\nDry run — nothing changed. ${stranded.length} broadcast(s) / ${totalRecipients} recipient(s) would be ${hardDelete ? "DELETED" : "marked FAILED"}.`,
    );
    console.log("Re-run with --apply to act on them.");
    return;
  }

  if (hardDelete) {
    const { count } = await prisma.broadcast.deleteMany({
      where: { id: { in: stranded.map((b) => b.id) } },
    });
    console.log(`\nDeleted ${count} broadcast(s) and their ${totalRecipients} recipient(s).`);
    return;
  }

  for (const b of stranded) {
    await prisma.$transaction([
      prisma.broadcastRecipient.updateMany({
        where: { broadcastId: b.id, status: "PENDING" },
        data: { status: "FAILED", error: "never enqueued — stranded by BullMQ job id error" },
      }),
      prisma.broadcast.update({
        where: { id: b.id },
        data: {
          status: "FAILED",
          failedCount: { increment: b.recipients.length },
          completedAt: new Date(),
        },
      }),
    ]);
  }
  console.log(`\nMarked ${stranded.length} broadcast(s) FAILED (${totalRecipients} recipient(s)).`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sendQueue.close();
    connection.disconnect();
    await prisma.$disconnect();
  });
