"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface List { id: string; name: string; archived: boolean; _count: { memberships: number } }
interface Snapshot { id: string; listName: string; memberCount: number; reason: string; createdAt: string }

export default function ListsManager() {
  const [lists, setLists] = useState<List[]>([]);
  const [snaps, setSnaps] = useState<Record<string, Snapshot[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgError, setMsgError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function say(text: string) { setMsg(text); setMsgError(false); }
  function fail(text: string) { setMsg(text); setMsgError(true); }

  const loadLists = useCallback(async () => {
    const res = await apiFetch(`/api/lists${showArchived ? "?includeArchived=1" : ""}`);
    if (res.ok) setLists((await res.json()).lists ?? []);
  }, [showArchived]);
  useEffect(() => { void loadLists(); }, [loadLists]);

  const loadSnaps = useCallback(async (listId: string) => {
    const res = await apiFetch(`/api/lists/${listId}/snapshots`);
    if (!res.ok) return;
    const data = await res.json();
    setSnaps((p) => ({ ...p, [listId]: data.snapshots ?? [] }));
  }, []);

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setMsg(null);
    const res = await apiFetch("/api/lists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) { setNewName(""); await loadLists(); }
    else { const j = await res.json().catch(() => ({})); fail(j.error ?? "Could not create list"); }
  }

  function toggle(listId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else { next.add(listId); void loadSnaps(listId); }
      return next;
    });
  }

  async function snapshotNow(listId: string) {
    setBusy(`snap:${listId}`); setMsg(null);
    const res = await apiFetch(`/api/lists/${listId}/snapshots`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      say(`Snapshot saved (${j.memberCount} member${j.memberCount === 1 ? "" : "s"}).`);
      if (!open.has(listId)) toggle(listId); else void loadSnaps(listId);
    } else fail(j.error ?? "Snapshot failed");
  }

  async function restore(listId: string, snapshotId: string) {
    if (!confirm("Restore this list to the snapshot? Current members will be replaced.")) return;
    setBusy(`restore:${snapshotId}`); setMsg(null);
    const res = await apiFetch(`/api/lists/${listId}/snapshots/${snapshotId}/restore`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      say(`Restored ${j.restored} member(s)${j.missing > 0 ? ` · ${j.missing} skipped (deleted contacts)` : ""}.`);
      await loadLists();
    } else fail(j.error ?? "Restore failed");
  }

  async function setArchived(list: List, archived: boolean) {
    setBusy(`arch:${list.id}`); setMsg(null);
    const res = await apiFetch(`/api/lists/${list.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      say(archived
        ? `Archived "${list.name}" — it is out of the pickers, its broadcasts keep their history.`
        : `Restored "${list.name}".`);
      await loadLists();
    } else fail(j.error ?? "Could not update the list");
  }

  async function removeList(list: List) {
    const members = list._count.memberships;
    const warning =
      `Delete the list "${list.name}"?\n\n` +
      (members > 0
        ? `Its ${members} member${members === 1 ? "" : "s"} stay in Contacts — only the list and its snapshots are removed.`
        : "Its snapshots are removed too.") +
      "\n\nThis cannot be undone.";
    if (!confirm(warning)) return;
    setBusy(`del:${list.id}`); setMsg(null);
    const res = await apiFetch(`/api/lists/${list.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      say(`Deleted "${list.name}".`);
      setOpen((prev) => { const next = new Set(prev); next.delete(list.id); return next; });
      setSnaps((prev) => { const next = { ...prev }; delete next[list.id]; return next; });
      await loadLists();
    } else fail(j.error ?? "Delete failed");
  }

  return (
    <div>
      <form onSubmit={createList} className="row" style={{ marginBottom: 18 }}>
        <input className="input" style={{ maxWidth: 320 }} value={newName}
          onChange={(e) => setNewName(e.target.value)} placeholder="New list name" maxLength={120} />
        <button className="btn btn--sm" type="submit" disabled={!newName.trim()}>Create list</button>
        <label className="note row" style={{ gap: 6, cursor: "pointer" }}>
          <input type="checkbox" data-test-id="show-archived" checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        {msg && (
          <span className="note" data-test-id="lists-msg"
            style={{ color: msgError ? "var(--danger)" : "var(--green)" }}>{msg}</span>
        )}
      </form>

      <div className="grid-forms" style={{ gridTemplateColumns: "1fr" }}>
        {lists.map((l) => (
          <div key={l.id} className="card" data-test-id="list-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{l.name}</strong>
                <span className="muted"> · {l._count.memberships} member{l._count.memberships === 1 ? "" : "s"}</span>
                {l.archived && <span className="badge badge--PENDING" style={{ marginInlineStart: 8 }}>archived</span>}
              </div>
              <div className="row">
                <button className="btn btn--ghost btn--sm" onClick={() => snapshotNow(l.id)}
                  disabled={busy === `snap:${l.id}`} aria-busy={busy === `snap:${l.id}`}>
                  {busy === `snap:${l.id}` ? "Saving…" : "Snapshot now"}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => toggle(l.id)}>
                  {open.has(l.id) ? "Hide snapshots" : "Snapshots"}
                </button>
                <button className="btn btn--ghost btn--sm" data-test-id="archive-list"
                  onClick={() => setArchived(l, !l.archived)}
                  disabled={busy === `arch:${l.id}`} aria-busy={busy === `arch:${l.id}`}
                  title={l.archived ? "Put this list back in the pickers" : "Retire this list without touching its broadcast history"}>
                  {busy === `arch:${l.id}` ? "Saving…" : l.archived ? "Restore" : "Archive"}
                </button>
                <button className="btn btn--ghost btn--sm" data-test-id="delete-list"
                  onClick={() => removeList(l)} disabled={busy === `del:${l.id}`} aria-busy={busy === `del:${l.id}`}
                  style={{ color: "var(--danger)" }} title="Delete this list — its contacts are kept">
                  {busy === `del:${l.id}` ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>

            {open.has(l.id) && (
              <table className="table" style={{ marginTop: 12 }}>
                <thead><tr><th>Taken</th><th>Reason</th><th>Members</th><th style={{ textAlign: "end" }}>Restore</th></tr></thead>
                <tbody>
                  {(snaps[l.id] ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.createdAt).toLocaleString()}</td>
                      <td><span className="badge badge--PENDING">{s.reason}</span></td>
                      <td>{s.memberCount}</td>
                      <td style={{ textAlign: "end" }}>
                        <button className="btn btn--ghost btn--sm" data-test-id="restore-snapshot"
                          onClick={() => restore(l.id, s.id)} disabled={busy === `restore:${s.id}`} aria-busy={busy === `restore:${s.id}`}>
                          {busy === `restore:${s.id}` ? "Restoring…" : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(snaps[l.id] ?? []).length === 0 && (
                    <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>No snapshots yet — take one before changing the list.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {lists.length === 0 && <p className="muted">No lists yet. Create one above or from the dashboard.</p>}
      </div>
    </div>
  );
}
