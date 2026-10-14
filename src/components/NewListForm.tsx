"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export interface DashboardList {
  id: string;
  name: string;
  _count?: { memberships: number };
}

/**
 * Dashboard "Lists" card: create a list, and delete one without
 * leaving the dashboard. Snapshots and restores live on /lists.
 */
export default function NewListForm({ lists = [] }: { lists?: DashboardList[] }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      window.location.reload();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not create list");
    }
  }

  async function remove(list: DashboardList) {
    const members = list._count?.memberships ?? 0;
    const warning =
      `Delete the list "${list.name}"?\n\n` +
      (members > 0
        ? `Its ${members} member${members === 1 ? "" : "s"} stay in Contacts — only the list and its snapshots are removed.`
        : "Its snapshots are removed too.") +
      "\n\nThis cannot be undone.";
    if (!confirm(warning)) return;
    setDeleting(list.id);
    setError(null);
    const res = await apiFetch(`/api/lists/${list.id}`, { method: "DELETE" });
    if (res.ok) {
      window.location.reload();
      return;
    }
    const j = await res.json().catch(() => ({}));
    setDeleting(null);
    setError(j.error ?? "Could not delete list");
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>New list</h3>
      <div className="field">
        <label className="label" htmlFor="ln">List name</label>
        <input id="ln" data-test-id="list-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <button data-test-id="list-submit" className="btn" type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating…" : "Create list"}
      </button>

      {lists.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="label">Your lists</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {lists.map((l) => (
              <li key={l.id} className="row" data-test-id="dash-list-row"
                style={{ justifyContent: "space-between", gap: 8, padding: "6px 0" }}>
                <span>
                  {l.name}
                  {l._count && (
                    <span className="muted"> · {l._count.memberships} member{l._count.memberships === 1 ? "" : "s"}</span>
                  )}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" data-test-id="dash-delete-list"
                  style={{ color: "var(--danger)" }} title="Delete this list — its contacts are kept"
                  onClick={() => remove(l)} disabled={deleting === l.id} aria-busy={deleting === l.id}>
                  {deleting === l.id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="note" style={{ marginTop: 10, color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
