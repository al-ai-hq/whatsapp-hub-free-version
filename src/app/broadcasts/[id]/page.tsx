import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import SidebarLayout from "@/components/SidebarLayout";
import LiveProgress from "@/components/LiveProgress";

export const dynamic = "force-dynamic";

export default async function BroadcastDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const b = await prisma.broadcast.findFirst({
    where: { id },
    include: { template: true, list: true },
  });
  if (!b) notFound();

  const timeline: string[] = [];
  if (b.scheduledAt) timeline.push(`Scheduled ${fmt(b.scheduledAt)}`);
  if (b.startedAt) timeline.push(`Started ${fmt(b.startedAt)}`);
  timeline.push(b.completedAt ? `Completed ${fmt(b.completedAt)}` : "In progress");

  return (
    <SidebarLayout>
      <Link href="/dashboard" className="bd-back reveal">
        <span aria-hidden>←</span> Dashboard
      </Link>

      <header className="bd-head reveal">
        <p className="eyebrow">Campaign · {b.template.language.toUpperCase()}</p>
        <h1 className="bd-title">
          {b.template.name}
          <span className="bd-title__to" aria-hidden>→</span>
          <span className="bd-title__list">{b.list.name}</span>
        </h1>
        <p className="bd-timeline">
          {timeline.map((t, i) => (
            <span key={t}>
              {i > 0 && <span className="bd-timeline__sep" aria-hidden>·</span>}
              {t}
            </span>
          ))}
        </p>
      </header>

      <LiveProgress
        broadcastId={b.id}
        initialStatus={b.status}
        initialCounts={{ total: b.totalCount, sent: b.sentCount, failed: b.failedCount }}
      />
    </SidebarLayout>
  );
}

function fmt(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
