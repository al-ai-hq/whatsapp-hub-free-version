"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Link { id: string; slug: string; url: string; createdAt: string }

/**
 * Manage the /go/<slug> destinations a template's URL button can point at.
 */
export default function RedirectsManager() {
  const [links, setLinks] = useState<Link[]>([]);
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgError, setMsgError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [apex, setApex] = useState("");

  function say(t: string) { setMsg(t); setMsgError(false); }
  function fail(t: string) { setMsg(t); setMsgError(true); }

  useEffect(() => {
    setApex(window.location.host);
  }, []);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/redirects");
    if (res.ok) setLinks((await res.json()).links ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy("create");
    const res = await apiFetch("/api/redirects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug.trim(), url: url.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) { setSlug(""); setUrl(""); say(`Added /go/${j.link?.slug}`); await load(); }
    else fail(j.error ?? "Could not add the link");
  }

  async function save(id: string) {
    setBusy(`save:${id}`); setMsg(null);
    const res = await apiFetch(`/api/redirects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: editUrl.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      setEditing(null);
      say("Destination updated — every template already pointing here now follows it.");
      await load();
    } else fail(j.error ?? "Could not update the link");
  }

  async function remove(link: Link) {
    if (!confirm(`Delete /go/${link.slug}? Any template button already pointing at it will stop working.`)) return;
    setBusy(`del:${link.id}`); setMsg(null);
    const res = await apiFetch(`/api/redirects/${link.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) { say(`Deleted /go/${link.slug}`); await load(); }
    else fail(j.error ?? "Could not delete the link");
  }

  async function copy(link: Link) {
    const full = `https://${apex}/go/${link.slug}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(link.id);
      setTimeout(() => setCopied(null), 2000);
    } catch { fail(`Copy failed — the address is ${full}`); }
  }

  return (
    <section>
      <h2 style={{ marginTop: 32 }}>Template link buttons</h2>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        A template&rsquo;s URL button must point here rather than straight at the destination
        &mdash; WhatsApp scrapes the target and would otherwise render a link-preview card above
        your message. Paste the address below into Meta, and change where it goes any time
        without touching the approved template.
      </p>

      <div className="card">
        <form onSubmit={create} className="grid-forms">
          <label>
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-instagram"
              aria-describedby="slug-hint"
              required
            />
            <small id="slug-hint" className="muted">
              Permanent &mdash; it is printed inside the approved template.
            </small>
          </label>
          <label>
            Destination
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/yourbrand"
              required
            />
            <small className="muted">
              Full http:// or https:// address. This is the part you can change later.
            </small>
          </label>
          <button className="btn" type="submit" disabled={busy === "create"}>
            {busy === "create" ? "Adding..." : "Add link"}
          </button>
        </form>
      </div>

      {msg && <p className={msgError ? "error" : "success"} role="status">{msg}</p>}

      {links.length === 0 ? (
        <p className="muted">No link buttons yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Address to paste into Meta</th>
                <th scope="col">Goes to</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td><code>https://{apex}/go/{l.slug}</code></td>
                  <td>
                    {editing === l.id ? (
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        aria-label={`New destination for ${l.slug}`}
                      />
                    ) : (
                      <a href={l.url} target="_blank" rel="noreferrer noopener">{l.url}</a>
                    )}
                  </td>
                  <td>
                    {editing === l.id ? (
                      <>
                        <button className="btn" onClick={() => void save(l.id)} disabled={busy === `save:${l.id}`}>
                          {busy === `save:${l.id}` ? "Saving..." : "Save"}
                        </button>{" "}
                        <button className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--ghost" onClick={() => void copy(l)}>
                          {copied === l.id ? "Copied" : "Copy"}
                        </button>{" "}
                        <button className="btn btn--ghost" onClick={() => { setEditing(l.id); setEditUrl(l.url); }}>
                          Repoint
                        </button>{" "}
                        <button className="btn btn--ghost" onClick={() => void remove(l)} disabled={busy === `del:${l.id}`}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
