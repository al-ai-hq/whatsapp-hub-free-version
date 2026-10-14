"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Recipient { id: string; phone: string; name: string | null; status: string; error: string | null }
interface Clicks { total: number; unique: number; byButton: { label: string; count: number }[] }
interface Detail {
  broadcast: { id: string; status: string; totalCount: number; sentCount: number; failedCount: number };
  counts: Record<string, number>;
  clicks: Clicks;
  page: { offset: number; limit: number; filteredTotal: number; status: string | null };
  recipients: Recipient[];
}

const TERMINAL = new Set(["COMPLETED", "FAILED"]);
const FILTERS = ["ALL", "PENDING", "SENT", "DELIVERED", "READ", "FAILED"] as const;
const PAGE = 50;

export default function LiveProgress({
  broadcastId, initialStatus, initialCounts,
}: {
  broadcastId: string;
  initialStatus: string;
  initialCounts: { total: number; sent: number; failed: number };
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [live, setLive] = useState(!TERMINAL.has(initialStatus));
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const load = useCallback(async (mode: "replace" | "append") => {
    const offset = mode === "append" ? offsetRef.current : 0;
    const q = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
    if (filter !== "ALL") q.set("status", filter);
    const res = await apiFetch(`/api/broadcasts/${broadcastId}?${q}`);
    if (!res.ok) return;
    const json = (await res.json()) as Detail;
    offsetRef.current = offset + json.recipients.length;
    setData((prev) =>
      mode === "append" && prev
        ? { ...json, recipients: [...prev.recipients, ...json.recipients] }
        : json,
    );
    if (TERMINAL.has(json.broadcast.status)) setLive(false);
  }, [broadcastId, filter]);

  useEffect(() => { offsetRef.current = 0; void load("replace"); }, [load]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { offsetRef.current = 0; void load("replace"); }, 4000);
    return () => clearInterval(t);
  }, [live, load]);

  const b = data?.broadcast ?? { status: initialStatus, totalCount: initialCounts.total, sentCount: initialCounts.sent, failedCount: initialCounts.failed };
  const counts = data?.counts ?? {};
  const done = b.sentCount + b.failedCount;
  const pct = b.totalCount > 0 ? Math.round((done / b.totalCount) * 100) : 0;
  const recipients = data?.recipients ?? [];
  const filteredTotal = data?.page.filteredTotal ?? 0;

  const clicks = data?.clicks ?? { total: 0, unique: 0, byButton: [] };
  const readN = counts.READ ?? 0;
  const deliveredN = (counts.DELIVERED ?? 0) + readN;
  const sentN = (counts.SENT ?? 0) + deliveredN;
  const ctr = deliveredN > 0 ? Math.round((clicks.unique / deliveredN) * 100) : 0;

  const retryFailed = useCallback(async () => {
    setRetrying(true); setRetryMsg(null);
    const res = await apiFetch(`/api/broadcasts/${broadcastId}/retry`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setRetrying(false);
    if (res.ok) {
      setRetryMsg(`Re-queued ${json.retried} failed recipient(s).`);
      setLive(true); offsetRef.current = 0; await load("replace");
    } else setRetryMsg(`Error: ${json.error ?? res.status}`);
  }, [broadcastId, load]);

  return (
    <div data-test-id="live-progress">
      <div className="bd-progress">
        <div className="bd-progress__row">
          <span className={`badge badge--${b.status}`}>{b.status}</span>
          {live && (
            <span className="bd-progress__live">
              <span className="pulse-dot" aria-hidden /> Live
            </span>
          )}
          <span className="bd-progress__pct">{pct}%</span>
        </div>
        <div className="progress"><div className="progress__bar" style={{ width: `${pct}%` }} /></div>
        <div className="note" style={{ marginTop: 8 }}>
          {done.toLocaleString()} of {b.totalCount.toLocaleString()} processed
        </div>
      </div>

      <div className="dash-ledger" style={{ marginBottom: 22 }}>
        <div className="dash-ledger__item">
          <div className="dash-ledger__num">{b.totalCount.toLocaleString()}</div>
          <div className="dash-ledger__label">Recipients</div>
        </div>
        <div className="dash-ledger__item">
          <div className="dash-ledger__num">{b.sentCount.toLocaleString()}</div>
          <div className="dash-ledger__label">Sent</div>
        </div>
        <div className="dash-ledger__item">
          <div className={`dash-ledger__num${b.failedCount > 0 ? " dash-ledger__num--danger" : ""}`}>
            {b.failedCount.toLocaleString()}
          </div>
          <div className="dash-ledger__label">Failed</div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Analytics</h2>
      <div className="analytics">
        <div className="funnel" data-test-id="funnel">
          <FunnelRow label="Sent" value={sentN} total={b.totalCount} />
          <FunnelRow label="Delivered" value={deliveredN} total={b.totalCount} />
          <FunnelRow label="Read · opened" value={readN} total={b.totalCount} />
          <FunnelRow label="Clicked" value={clicks.unique} total={b.totalCount} accent />
        </div>
        <div className="clicks card" data-test-id="click-events">
          <h3 style={{ marginBottom: 4 }}>Button events</h3>
          <p className="note" style={{ margin: "0 0 12px" }}>
            {clicks.total} tap(s) · {clicks.unique} unique · {ctr}% CTR of delivered
          </p>
          {clicks.byButton.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No button clicks recorded yet.</p>
          ) : (
            clicks.byButton.map((bn) => (
              <div key={bn.label} className="clicks__row">
                <span>{bn.label}</span>
                <span className="badge badge--READ">{bn.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {b.failedCount > 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button data-test-id="retry-failed" className="btn btn--danger btn--sm" onClick={retryFailed} disabled={retrying} aria-busy={retrying}>
            {retrying ? "Retrying…" : `Retry ${b.failedCount} failed`}
          </button>
          {retryMsg && <span className="note">{retryMsg}</span>}
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f} data-test-id={`filter-${f}`}
            className={`pill ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
            {f}{f !== "ALL" && counts[f] != null ? ` ${counts[f]}` : ""}
          </button>
        ))}
      </div>

      <table data-test-id="recipients-table" className="table">
        <thead><tr><th>Phone</th><th>Name</th><th>Status</th><th>Error</th></tr></thead>
        <tbody>
          {recipients.map((r) => (
            <tr key={r.id}>
              <td>{r.phone}</td>
              <td>{r.name ?? "—"}</td>
              <td><span className={`badge badge--${r.status}`}>{r.status}</span></td>
              <td className="note">{r.error ?? ""}</td>
            </tr>
          ))}
          {recipients.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No recipients.</td></tr>}
        </tbody>
      </table>

      {recipients.length < filteredTotal && (
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} onClick={() => load("append")}>
          Load more ({recipients.length}/{filteredTotal})
        </button>
      )}
    </div>
  );
}

function FunnelRow({ label, value, total, accent }: { label: string; value: number; total: number; accent?: boolean }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="funnel__row">
      <div className="funnel__label">{label}</div>
      <div className="funnel__track">
        <div className={`funnel__bar${accent ? " funnel__bar--accent" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="funnel__val">{value.toLocaleString()} <span className="muted">· {pct}%</span></div>
    </div>
  );
}
