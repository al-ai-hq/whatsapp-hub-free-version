"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface ListRef { id: string; name: string; archived: boolean }
interface Contact { id: string; phone: string; name: string | null; optedOut: boolean; lists: ListRef[] }
const PAGE = 50;

export default function ContactsTable() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [optFilter, setOptFilter] = useState<"all" | "true" | "false">("all");
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const offsetRef = useRef(0);

  const [lists, setLists] = useState<ListRef[]>([]);

  // Multi-select + inline edit state.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLists, setEditLists] = useState<Set<string>>(new Set());
  const [editErr, setEditErr] = useState<string | null>(null);

  // Bulk "add to list".
  const [bulkListId, setBulkListId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Inline confirmation state (replaces native confirm()/alert()).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (mode: "replace" | "append") => {
    setBusy(true);
    const offset = mode === "append" ? offsetRef.current : 0;
    const q = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
    if (query.trim()) q.set("query", query.trim());
    if (optFilter !== "all") q.set("optedOut", optFilter);
    const res = await apiFetch(`/api/contacts?${q}`);
    setBusy(false);
    if (!res.ok) return;
    const json = await res.json();
    offsetRef.current = offset + json.contacts.length;
    setTotal(json.page.total);
    setContacts((prev) => (mode === "append" ? [...prev, ...json.contacts] : json.contacts));
    if (mode === "replace") setSelected(new Set());
  }, [query, optFilter]);

  useEffect(() => {
    const t = setTimeout(() => { offsetRef.current = 0; void load("replace"); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/lists");
      if (!res.ok) return;
      const j = await res.json().catch(() => null);
      if (j?.lists) setLists(j.lists.map((l: ListRef) => ({ id: l.id, name: l.name, archived: !!l.archived })));
    })();
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }

  async function toggleOptOut(c: Contact) {
    const res = await apiFetch(`/api/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optedOut: !c.optedOut }),
    });
    if (res.ok) setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, optedOut: !x.optedOut } : x)));
  }

  async function remove(c: Contact) {
    setConfirmingId(null);
    const res = await apiFetch(`/api/contacts/${c.id}`, { method: "DELETE" });
    if (res.ok) {
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(c.id); return n; });
      setTotal((t) => Math.max(0, t - 1));
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setConfirmBulk(false);
    const res = await apiFetch("/api/contacts/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return;
    const j = await res.json();
    setSelected(new Set());
    offsetRef.current = 0;
    await load("replace");
    setNotice(
      j.skipped > 0
        ? `Deleted ${j.deleted}. Skipped ${j.skipped} (they have broadcast history).`
        : `Deleted ${j.deleted} contact${j.deleted === 1 ? "" : "s"}.`,
    );
  }

  function startEdit(c: Contact) {
    setEditingId(c.id);
    setEditName(c.name ?? "");
    setEditPhone(c.phone);
    setEditLists(new Set(c.lists.map((l) => l.id)));
    setEditErr(null);
  }
  function cancelEdit() { setEditingId(null); setEditErr(null); }

  function toggleEditList(listId: string) {
    setEditLists((prev) => {
      const next = new Set(prev);
      next.has(listId) ? next.delete(listId) : next.add(listId);
      return next;
    });
  }

  async function saveEdit(c: Contact) {
    setEditErr(null);
    const res = await apiFetch(`/api/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim(), listIds: [...editLists] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setEditErr(j.error ?? `Error ${res.status}`); return; }
    setContacts((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? { ...x, name: j.contact.name, phone: j.contact.phone, lists: j.contact.lists ?? x.lists }
          : x,
      ),
    );
    setEditingId(null);
  }

  async function bulkAddToList() {
    if (!bulkListId || selected.size === 0) return;
    setBulkBusy(true);
    setNotice(null);
    const res = await apiFetch("/api/contacts/bulk-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], listId: bulkListId }),
    });
    const j = await res.json().catch(() => ({}));
    setBulkBusy(false);
    if (!res.ok) { setNotice(j.error ?? `Error ${res.status}`); return; }
    setNotice(
      `Added ${j.added} to "${j.listName}".` +
        (j.alreadyIn > 0 ? ` ${j.alreadyIn} already there.` : "") +
        (j.skipped > 0 ? ` ${j.skipped} skipped.` : ""),
    );
    setBulkListId("");
    offsetRef.current = 0;
    await load("replace");
  }

  return (
    <div className="ct">
      <div className="ct-toolbar">
        <input
          data-test-id="contacts-search" className="input input--sm" style={{ maxWidth: 320 }}
          aria-label="Search contacts by phone or name"
          placeholder="Search phone or name…" value={query} onChange={(e) => setQuery(e.target.value)}
        />
        {(["all", "false", "true"] as const).map((f) => (
          <button key={f} aria-pressed={optFilter === f} className={`pill ${optFilter === f ? "is-active" : ""}`} onClick={() => setOptFilter(f)}>
            {f === "all" ? "All" : f === "false" ? "Active" : "Opted out"}
          </button>
        ))}
        <span className="spacer" />
        {selected.size > 0 && lists.length > 0 && (
          <span className="row" style={{ gap: 6 }}>
            <select aria-label="Add selected contacts to list" data-test-id="bulk-list-select"
              className="input input--sm" style={{ maxWidth: 200 }} value={bulkListId}
              onChange={(e) => setBulkListId(e.target.value)}>
              <option value="">— add to list —</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn btn--sm" data-test-id="bulk-list-add" disabled={!bulkListId || bulkBusy}
              onClick={bulkAddToList} aria-busy={bulkBusy}>
              {bulkBusy ? "Adding…" : `Add ${selected.size}`}
            </button>
          </span>
        )}
        {selected.size > 0 && (
          confirmBulk ? (
            <span className="row" style={{ gap: 8 }}>
              <span className="note">Delete {selected.size} selected? Can&apos;t be undone.</span>
              <button data-test-id="bulk-delete" className="btn btn--danger btn--sm" onClick={bulkDelete}>Confirm</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirmBulk(false)}>Cancel</button>
            </span>
          ) : (
            <button className="btn btn--danger btn--sm" onClick={() => { setConfirmBulk(true); setNotice(null); }}>
              Delete selected ({selected.size})
            </button>
          )
        )}
        <span className="note" aria-live="polite">
          {notice ?? `${total.toLocaleString()} ${total === 1 ? "contact" : "contacts"}`}
        </span>
      </div>

      <table data-test-id="contacts-table" className="table dash-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input type="checkbox" aria-label="Select all" data-test-id="select-all"
                checked={allSelected} onChange={toggleSelectAll} />
            </th>
            <th>Phone</th><th>Name</th><th>Lists</th><th>Status</th><th style={{ textAlign: "end" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => {
            const editing = editingId === c.id;
            return (
              <tr key={c.id} className={selected.has(c.id) ? "is-selected" : undefined}>
                <td>
                  <input type="checkbox" aria-label={`Select ${c.phone}`} data-test-id="row-select"
                    checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                </td>
                <td>
                  {editing
                    ? <input className="input input--sm" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                    : c.phone}
                </td>
                <td>
                  {editing
                    ? <input className="input input--sm" value={editName} placeholder="Name"
                        onChange={(e) => setEditName(e.target.value)} />
                    : (c.name ?? "—")}
                  {editing && editErr && <div className="error-text">{editErr}</div>}
                </td>
                <td>
                  {editing ? (
                    lists.length === 0 ? (
                      <span className="muted">No lists yet</span>
                    ) : (
                      <div className="ct-lists" role="group" aria-label={`Lists for ${c.phone}`}>
                        {lists.map((l) => (
                          <label key={l.id} className="ct-lists__opt">
                            <input type="checkbox" data-test-id="edit-list-option"
                              checked={editLists.has(l.id)} onChange={() => toggleEditList(l.id)} />
                            {l.name}
                          </label>
                        ))}
                        {c.lists.filter((l) => l.archived).map((l) => (
                          <span key={l.id} className="note">{l.name} (archived)</span>
                        ))}
                      </div>
                    )
                  ) : c.lists.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="ct-chips">
                      {c.lists.map((l) => (
                        <span key={l.id} className={`badge badge--${l.archived ? "PENDING" : "ACTIVE"}`}>
                          {l.name}{l.archived ? " (archived)" : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge badge--${c.optedOut ? "OPTEDOUT" : "ACTIVE"}`}>
                    {c.optedOut ? "Opted out" : "Active"}
                  </span>
                </td>
                <td style={{ textAlign: "end" }}>
                  {editing ? (
                    <>
                      <button className="btn btn--sm" data-test-id="edit-save" onClick={() => saveEdit(c)}>Save</button>{" "}
                      <button className="btn btn--ghost btn--sm" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn--ghost btn--sm" data-test-id="edit-contact" onClick={() => startEdit(c)}>Edit</button>{" "}
                      <button className="btn btn--ghost btn--sm" onClick={() => toggleOptOut(c)}>
                        {c.optedOut ? "Re-subscribe" : "Opt out"}
                      </button>
                      <>
                        {" "}
                        {confirmingId === c.id ? (
                          <>
                            <button className="btn btn--danger btn--sm" onClick={() => remove(c)}>Confirm delete</button>{" "}
                            <button className="btn btn--ghost btn--sm" onClick={() => setConfirmingId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button className="btn btn--danger btn--sm" onClick={() => setConfirmingId(c.id)}>Delete</button>
                        )}
                      </>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {contacts.length === 0 && !busy && (
            <tr>
              <td colSpan={6}>
                <div className="dash-empty">
                  <strong>{query.trim() || optFilter !== "all" ? "No matches" : "No contacts yet"}</strong>
                  {query.trim() || optFilter !== "all"
                    ? "Try a different search, or clear the filter."
                    : "Add a number above, or import a CSV to build your first list."}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {contacts.length < total && (
        <div className="ct-more">
          <button className="btn btn--ghost btn--sm" onClick={() => load("append")}>
            Load more ({contacts.length.toLocaleString()}/{total.toLocaleString()})
          </button>
        </div>
      )}
    </div>
  );
}
