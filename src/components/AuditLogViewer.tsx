"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Entry {
  id: string;
  actor: string;
  role: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

const PAGE = 50;

const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "broadcast.sent": "Sent broadcast",
  "broadcast.scheduled": "Scheduled broadcast",
  "broadcast.retried": "Retried broadcast",
  "template.submitted": "Submitted template",
  "contact.created": "Added contact",
  "contact.updated": "Updated contact",
  "contact.deleted": "Deleted contact",
  "contacts.imported": "Imported contacts",
  "contacts.bulk_deleted": "Bulk-deleted contacts",
  "list.created": "Created list",
  "list.restored": "Restored list snapshot",
  "campaign.created": "Created recurring campaign",
  "campaign.paused": "Paused recurring campaign",
  "campaign.resumed": "Resumed recurring campaign",
  "campaign.deleted": "Deleted recurring campaign",
  "settings.whatsapp_updated": "Updated WhatsApp settings",
};

function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && !Array.isArray(v))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

export default function AuditLogViewer() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load(offset = 0) {
    setBusy(true);
    const r = await apiFetch(`/api/audit?offset=${offset}&limit=${PAGE}`);
    setBusy(false);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return;
    setTotal(j.page.total);
    setEntries((prev) => (offset === 0 ? j.entries : [...(prev ?? []), ...j.entries]));
  }
  useEffect(() => { void load(); }, []);

  if (!entries) return null;

  return (
    <>
      <h2 style={{ marginTop: 32 }}>Activity</h2>
      <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Who did what</h3>
        <span className="muted" style={{ fontSize: 13 }}>{total} entr{total === 1 ? "y" : "ies"}</span>
      </div>
      <table className="table" data-test-id="audit-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.actor}</td>
              <td>{LABELS[e.action] ?? e.action}</td>
              <td className="muted">
                {e.target ?? ""}
                {e.target && metaSummary(e.meta) ? " — " : ""}
                {metaSummary(e.meta)}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No activity recorded yet.</td></tr>
          )}
        </tbody>
      </table>
      {entries.length < total && (
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={() => load(entries.length)}
          disabled={busy} aria-busy={busy}>
          {busy ? "Loading..." : "Load more"}
        </button>
      )}
      </div>
    </>
  );
}
