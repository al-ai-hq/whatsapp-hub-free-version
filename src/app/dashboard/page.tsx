import Link from "next/link";
import type { RecipientStatus, BroadcastStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import SidebarLayout from "@/components/SidebarLayout";
import UploadForm from "@/components/UploadForm";
import NewListForm from "@/components/NewListForm";
import BroadcastForm from "@/components/BroadcastForm";

export const dynamic = "force-dynamic";

function T({ en, ar }: { en: string; ar: string }) {
  return (
    <>
      <span data-lang="en">{en}</span>
      <span data-lang="ar">{ar}</span>
    </>
  );
}

export default async function Dashboard() {
  const [contacts, optedOut, lists, templates, broadcasts, recipientGroups, statusGroups, unreadAgg] =
    await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { optedOut: true } }),
      prisma.contactList.findMany({
        where: { archived: false },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { memberships: true } } },
      }),
      prisma.template.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" } }),
      prisma.broadcast.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { template: true, list: true },
      }),
      prisma.broadcastRecipient.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.broadcast.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.conversation.aggregate({ _sum: { unread: true } }),
    ]);

  // Delivery funnel
  const rc: Record<RecipientStatus, number> = { PENDING: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0 };
  for (const g of recipientGroups) rc[g.status] = g._count._all;
  const read = rc.READ;
  const delivered = rc.DELIVERED + rc.READ;
  const sent = rc.SENT + rc.DELIVERED + rc.READ;
  const failed = rc.FAILED;
  const pending = rc.PENDING;
  const totalRecipients = sent + failed + pending;
  const everSent = sent > 0;

  // Campaign lifecycle
  const bs: Record<BroadcastStatus, number> = { DRAFT: 0, SCHEDULED: 0, QUEUED: 0, SENDING: 0, COMPLETED: 0, FAILED: 0 };
  for (const g of statusGroups) bs[g.status] = g._count._all;
  const sendingNow = bs.SENDING + bs.QUEUED;
  const scheduled = bs.SCHEDULED;
  const unread = unreadAgg._sum.unread ?? 0;

  const optedIn = contacts - optedOut;
  const optInPct = pct(optedIn, contacts);

  return (
    <SidebarLayout>
      <header className="dash-head reveal">
        <div>
          <p className="eyebrow">
            <T en="Command center" ar="\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u0643\u0645" />
          </p>
          <h1>
            <T en="Dashboard" ar="\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645" />
          </h1>
          <p className="dash-status" aria-live="polite">
            {sendingNow > 0 ? (
              <>
                <span className="pulse-dot" aria-hidden />
                <span>
                  <strong>{nf(sendingNow)}</strong>{" "}
                  <T en={plural(sendingNow, "campaign")} ar={plural(sendingNow, "\u062D\u0645\u0644\u0629", "\u062D\u0645\u0644\u0627\u062A")} />{" "}
                  <T en="sending now" ar="\u062A\u064F\u0631\u0633\u0644 \u0627\u0644\u0622\u0646" />
                </span>
              </>
            ) : scheduled > 0 ? (
              <span>
                <strong>{nf(scheduled)}</strong>{" "}
                <T en={plural(scheduled, "campaign")} ar={plural(scheduled, "\u062D\u0645\u0644\u0629", "\u062D\u0645\u0644\u0627\u062A")} />{" "}
                <T en="scheduled to send" ar="\u0645\u062C\u062F\u0648\u0644\u0629 \u0644\u0644\u0625\u0631\u0633\u0627\u0644" />
              </span>
            ) : (
              <span>
                <T en="Nothing sending right now — all quiet." ar="\u0644\u0627 \u0634\u064A\u0621 \u064A\u064F\u0631\u0633\u0644 \u0627\u0644\u0622\u0646 — \u0643\u0644 \u0634\u064A\u0621 \u0647\u0627\u062F\u0626." />
              </span>
            )}
            {unread > 0 && (
              <>
                <span className="dash-status__sep" aria-hidden>·</span>
                <Link href="/inbox" className="dash-status__link">
                  {nf(unread)}{" "}
                  <T en={plural(unread, "reply", "replies")} ar={plural(unread, "\u0631\u062F", "\u0631\u062F\u0648\u062F")} />
                </Link>
              </>
            )}
          </p>
        </div>
        <p className="dash-asof">
          <T en="Snapshot" ar="\u0644\u0642\u0637\u0629" /> · {timeLabel(new Date())}
        </p>
      </header>

      <section className="analytics reveal d1" aria-label="Deliverability">
        <div className="card">
          <div className="dash-cardhead">
            <h3><T en="Deliverability" ar="\u0645\u0639\u062F\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644" /></h3>
            <span className="note"><T en="across all sends" ar="\u0639\u0628\u0631 \u062C\u0645\u064A\u0639 \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u0627269" /></span>
          </div>
          {everSent ? (
            <>
              <div className="dash-rates">
                <Rate value={`${pct(delivered, sent)}%`} label="Reached the phone" labelAr="\u0648\u0635\u0644\u062A \u0644\u0644\u0647\u0627\u062A\u0641" />
                <Rate value={`${pct(read, delivered)}%`} label="Opened & read" labelAr="\u0641\u064F\u062A\u062D\u062A \u0648\u0642\u064F\u0631\u0626\u062A" />
                <Rate value={`${pct(failed, totalRecipients)}%`} label="Failed" labelAr="\u0641\u0634\u0644\u062A" muted={failed === 0} />
              </div>
              <div className="funnel">
                <FunnelRow label="Sent" labelAr="\u0645\u064F\u0631\u0633\u0644\u0629" value={sent} total={totalRecipients} accent />
                <FunnelRow label="Delivered" labelAr="\u0645\u0633\u0644\u0651\u0645\u0629" value={delivered} total={totalRecipients} />
                <FunnelRow label="Read" labelAr="\u0645\u0642\u0631\u0648\u0621\u0629" value={read} total={totalRecipients} />
              </div>
            </>
          ) : (
            <div className="dash-empty dash-empty--inset">
              <strong><T en="No messages sent yet" ar="\u0644\u0645 \u062A\u064F\u0631\u0633\u0644 \u0631\u0633\u0627\u0626\u0644 \u0628\u0639\u062F" /></strong>
              <T en="Your delivery funnel — sent, delivered, read — appears here after your first broadcast."
                ar="\u0642\u0645\u0639 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 — \u0627\u0644\u0645\u0631\u0633\u0644\u0629 \u0648\u0627\u0644\u0645\u0633\u0644\u0651\u0645\u0629 \u0648\u0627\u0644\u0645\u0642\u0631\u0648\u0621\u0629 — \u0633\u064A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0628\u0639\u062F \u0623\u0648\u0644 \u0628\u062B \u0644\u0643." />
            </div>
          )}
        </div>

        <div className="card">
          <div className="dash-cardhead">
            <h3><T en="Live now" ar="\u0645\u0628\u0627\u0634\u0631 \u0627\u0644\u0622\u0646" /></h3>
            {sendingNow > 0 && <span className="pulse-dot" aria-hidden />}
          </div>
          <div className="dash-pulse">
            <PulseRow k="Sending" kAr="\u062A\u064F\u0631\u0633\u0644" v={bs.SENDING} live={bs.SENDING > 0} />
            <PulseRow k="Queued" kAr="\u0641\u064A \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631" v={bs.QUEUED} />
            <PulseRow k="Scheduled" kAr="\u0645\u062C\u062F\u0648\u0644\u0629" v={scheduled} />
            <PulseRow k="Unread replies" kAr="\u0631\u062F\u0648\u062F \u063A\u064A\u0631 \u0645\u0642\u0631\u0648\u0621\u0629" v={unread} href="/inbox" accent={unread > 0} />
          </div>
        </div>
      </section>

      <section className="dash-ledger reveal d2" aria-label="Audience">
        <div className="dash-ledger__item">
          <div className="dash-ledger__num">{nf(contacts)}</div>
          <div className="dash-ledger__label"><T en="Contacts" ar="\u062C\u0647\u0627\u062A \u0627\u0644\u0627\u062A\u0635\u0627\u0644" /></div>
          {contacts > 0 && (
            <>
              <div className="dash-ledger__meter" aria-hidden><i style={{ width: `${optInPct}%` }} /></div>
              <div className="dash-ledger__sub">
                {optInPct}% <T en="opted in" ar="\u0648\u0627\u0641\u0642\u0648\u0627" /> · {nf(optedOut)} <T en="opted out" ar="\u0623\u0644\u063A\u0648\u0627 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643" />
              </div>
            </>
          )}
        </div>
        <div className="dash-ledger__item">
          <div className="dash-ledger__num">{nf(lists.length)}</div>
          <div className="dash-ledger__label"><T en="Lists" ar="\u0627\u0644\u0642\u0648\u0627\u0626\u0645" /></div>
          <Link href="/lists" className="dash-ledger__sub dash-ledger__sub--link">
            <T en="Manage lists" ar="\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0642\u0648\u0627\u0626\u0645" /> →
          </Link>
        </div>
        <div className="dash-ledger__item">
          <div className="dash-ledger__num">{nf(templates.length)}</div>
          <div className="dash-ledger__label"><T en="Approved templates" ar="\u0627\u0644\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629" /></div>
          <Link href="/templates" className="dash-ledger__sub dash-ledger__sub--link">
            <T en="View templates" ar="\u0639\u0631\u0636 \u0627\u0644\u0642\u0648\u0627\u0644\u0628" /> →
          </Link>
        </div>
      </section>

      <section className="dash-section reveal d3">
        <p className="eyebrow"><T en="Compose" ar="\u0625\u0646\u0634\u0627\u0621" /></p>
        <h2><T en="Build a list, import contacts, send" ar="\u0623\u0646\u0634\u0626 \u0642\u0627\u0626\u0645\u0629\u060C \u0627\u0633\u062A\u0648\u0631\u062F \u062C\u0647\u0627\u062A \u0627\u062A\u0635\u0627\u0644\u060C \u0623\u0631\u0633\u0650\u0644" /></h2>
      </section>
      <section className="grid-forms reveal d3">
        <NewListForm lists={lists} />
        <UploadForm lists={lists} />
        <BroadcastForm lists={lists} templates={templates} />
      </section>

      <section className="dash-section reveal d4">
        <h2><T en="Recent broadcasts" ar="\u0622\u062E\u0631 \u0627\u0644\u0628\u062B\u0648\u062B" /></h2>
      </section>
      <div className="card reveal d4" style={{ padding: 0, overflow: "hidden" }}>
        <table data-test-id="broadcasts-table" className="table dash-table">
          <thead>
            <tr>
              <th><T en="Template" ar="\u0627\u0644\u0642\u0627\u0644\u0628" /></th>
              <th><T en="List" ar="\u0627\u0644\u0642\u0627\u0626\u0645\u0629" /></th>
              <th><T en="Status" ar="\u0627\u0644\u062D\u0627\u0644\u0629" /></th>
              <th><T en="Delivery" ar="\u0627\u0644\u062A\u0648\u0635\u064A\u0644" /></th>
              <th><T en="Failed" ar="\u0641\u0627\u0634\u0644\u0629" /></th>
              <th><T en="When" ar="\u0645\u062A\u0649" /></th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => {
              const progress = pct(b.sentCount, b.totalCount);
              const when =
                b.status === "SCHEDULED" && b.scheduledAt
                  ? `Scheduled ${dateLabel(b.scheduledAt)}`
                  : rel(b.createdAt);
              return (
                <tr key={b.id}>
                  <td>
                    <Link href={`/broadcasts/${b.id}`} data-test-id="broadcast-link" className="dash-table__tpl">
                      {b.template.name}
                    </Link>
                  </td>
                  <td className="muted">{b.list.name}</td>
                  <td><span className={`badge badge--${b.status}`}>{b.status}</span></td>
                  <td>
                    <div className="dash-prog">
                      <span className="dash-prog__track" aria-hidden>
                        <span className="dash-prog__bar" style={{ width: `${progress}%` }} />
                      </span>
                      <span className="dash-prog__num">{nf(b.sentCount)}/{nf(b.totalCount)}</span>
                    </div>
                  </td>
                  <td className={b.failedCount > 0 ? "dash-fail" : "muted"}>{nf(b.failedCount)}</td>
                  <td className="muted dash-table__when">{when}</td>
                </tr>
              );
            })}
            {broadcasts.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="dash-empty">
                    <strong><T en="No broadcasts yet" ar="\u0644\u0627 \u0628\u062B\u0648\u062B \u0628\u0639\u062F" /></strong>
                    <T en="Pick a template and a list above, then send — your sends will show up here with live delivery."
                      ar="\u0627\u062E\u062A\u0631 \u0642\u0627\u0644\u0628\u0627\u064B \u0648\u0642\u0627\u0626\u0645\u0629 \u0623\u0639\u0644\u0627\u0647 \u062B\u0645 \u0623\u0631\u0633\u0650\u0644 — \u0633\u062A\u0638\u0647\u0631 \u0625\u0631\u0633\u0627\u0644\u0627\u062A\u0643 \u0647\u0646\u0627 \u0645\u0639 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631." />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SidebarLayout>
  );
}

function Rate({ value, label, labelAr, muted }: { value: string; label: string; labelAr: string; muted?: boolean }) {
  return (
    <div className="dash-rate">
      <div className={`dash-rate__val${muted ? " dash-rate__val--muted" : ""}`}>{value}</div>
      <div className="dash-rate__label"><T en={label} ar={labelAr} /></div>
    </div>
  );
}

function FunnelRow({ label, labelAr, value, total, accent }: { label: string; labelAr: string; value: number; total: number; accent?: boolean }) {
  const w = pct(value, total);
  return (
    <div className="funnel__row">
      <span className="funnel__label"><T en={label} ar={labelAr} /></span>
      <span className="funnel__track">
        <span className={`funnel__bar${accent ? " funnel__bar--accent" : ""}`} style={{ width: `${w}%` }} />
      </span>
      <span className="funnel__val">{nf(value)} · {w}%</span>
    </div>
  );
}

function PulseRow({ k, kAr, v, live, accent, href }: { k: string; kAr: string; v: number; live?: boolean; accent?: boolean; href?: string }) {
  const val = (
    <span className={`dash-pulse__v${accent && v > 0 ? " dash-pulse__v--accent" : ""}`}>{nf(v)}</span>
  );
  return (
    <div className="dash-pulse__row">
      <span className="dash-pulse__k">
        {live && <span className="pulse-dot" aria-hidden />}
        <T en={k} ar={kAr} />
      </span>
      {href && v > 0 ? <Link href={href}>{val}</Link> : val}
    </div>
  );
}

function nf(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? `${one}s`;
}

function rel(date: Date): string {
  const m = Math.round((Date.now() - date.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return dateLabel(date);
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
