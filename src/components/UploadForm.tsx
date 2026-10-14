"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface List { id: string; name: string }

export default function UploadForm({ lists }: { lists: List[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [listId, setListId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    if (listId) fd.set("listId", listId);
    const res = await apiFetch("/api/contacts/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `Imported ${j.inserted}, rejected ${j.rejectedCount}.` : `Error: ${j.error ?? res.status}`);
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>Upload contacts (CSV)</h3>
      <p className="note" style={{ marginBottom: 12 }}>
        Columns: <code>phone</code> (required), <code>firstName</code>, <code>lastName</code>, plus any
        extra columns as template variables. Phone numbers must include the country code
        (e.g. <code>+966500000001</code>).{" "}
        <a href="/contacts-template.csv" download data-test-id="download-template">Download CSV template</a>
      </p>
      <div className="field">
        <label className="label" htmlFor="csv">CSV file — must have a <code>phone</code> column</label>
        <input id="csv" data-test-id="upload-file" className="input" type="file" accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="list">Add to list (optional)</label>
        <select id="list" data-test-id="upload-list" className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
          <option value="">— none —</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <button data-test-id="upload-submit" className="btn" type="submit" disabled={busy || !file} aria-busy={busy}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {msg && <p data-test-id="upload-result" className="note" style={{ marginTop: 10 }}>{msg}</p>}
    </form>
  );
}
