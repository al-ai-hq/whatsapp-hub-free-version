"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface List { id: string; name: string }
interface Template { id: string; name: string; language: string; variableCount: number }
interface Campaign { id: string; name: string; cron: string; active: boolean; templateName: string; listName: string; lastRunAt: string | null }

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: "Daily 09:00 UTC", cron: "0 9 * * *" },
  { label: "Weekdays 09:00 UTC", cron: "0 9 * * 1-5" },
  { label: "Mondays 09:00 UTC", cron: "0 9 * * 1" },
  { label: "1st of month 09:00 UTC", cron: "0 9 1 * *" },
];

export default function CampaignsManager({ lists, templates }: { lists: List[]; templates: Template[] }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [listId, setListId] = useState("");
  const [cron, setCron] = useState("0 9 * * 1");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/recurring");
    if (res.ok) setCampaigns((await res.json()).campaigns);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await apiFetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, templateId, listId, cron, variableMap: [] }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setName(""); setMsg("Campaign created."); await load(); }
    else setMsg(`Error: ${j.error ?? res.status}`);
  }

  async function toggle(c: Campaign) {
    const res = await apiFetch(`/api/recurring/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    if (res.ok) setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
  }

  async function remove(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    const res = await apiFetch(`/api/recurring/${c.id}`, { method: "DELETE" });
    if (res.ok) setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
  }

  return (
    <div className="grid-forms">
      <form onSubmit={create} className="card">
        <h3>New recurring campaign</h3>
        <div className="field">
          <label className="label" htmlFor="camp-name">Name</label>
          <input id="camp-name" className="input" data-test-id="camp-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="camp-template">Template (approved)</label>
          <select id="camp-template" className="input" data-test-id="camp-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
            <option value="">— choose —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="camp-list">List</label>
          <select id="camp-list" className="input" data-test-id="camp-list" value={listId} onChange={(e) => setListId(e.target.value)} required>
            <option value="">— choose —</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="camp-cron">Schedule (cron, UTC)</label>
          <div className="row" style={{ marginBottom: 8 }}>
            {CRON_PRESETS.map((p) => (
              <button type="button" key={p.cron} className={`pill ${cron === p.cron ? "is-active" : ""}`} onClick={() => setCron(p.cron)}>
                {p.label}
              </button>
            ))}
          </div>
          <input id="camp-cron" className="input" data-test-id="camp-cron" value={cron} onChange={(e) => setCron(e.target.value)} required />
          <p className="note" style={{ marginTop: 4 }}>5-field cron, evaluated in UTC.</p>
        </div>
        <button className="btn" type="submit" data-test-id="camp-submit" disabled={busy || !templateId || !listId}>
          {busy ? "Creating..." : "Create campaign"}
        </button>
        {msg && <p className="note" style={{ marginTop: 10 }}>{msg}</p>}
      </form>

      <div className="card">
        <h3>Active & paused</h3>
        <table className="table">
          <thead><tr><th>Name</th><th>Schedule</th><th>State</th><th style={{ textAlign: "end" }}>Actions</th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}<div className="note">{c.templateName} → {c.listName}</div></td>
                <td><code>{c.cron}</code></td>
                <td><span className={`badge badge--${c.active ? "SENDING" : "PENDING"}`}>{c.active ? "ACTIVE" : "PAUSED"}</span></td>
                <td style={{ textAlign: "end" }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggle(c)}>{c.active ? "Pause" : "Resume"}</button>{" "}
                  <button className="btn btn--danger btn--sm" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No campaigns yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
