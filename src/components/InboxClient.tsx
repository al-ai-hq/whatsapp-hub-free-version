"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Convo {
  id: string; phone: string; name: string | null;
  lastPreview: string | null; lastMessageAt: string; lastInboundAt: string | null; unread: number;
}
interface Msg {
  id: string; direction: "IN" | "OUT"; type: string; text: string | null;
  mediaMime: string | null; mediaFilename: string | null; status: string | null; error: string | null; createdAt: string;
}
interface TplOption {
  id: string; name: string; language: string; variableCount: number; status: string;
  headerFormat?: string | null; copyCode?: boolean; ltoExpiration?: boolean; cards?: unknown;
}
function isRichTemplate(t: TplOption): boolean {
  return (
    ["IMAGE", "DOCUMENT", "VIDEO"].includes(t.headerFormat ?? "") ||
    !!t.copyCode || !!t.ltoExpiration || (Array.isArray(t.cards) && t.cards.length > 0)
  );
}

const MEDIA_LABEL: Record<string, string> = {
  image: "Photo", audio: "Voice message", video: "Video",
  sticker: "Sticker", location: "Location", reaction: "Reaction",
};
function bodyOf(m: Msg): string {
  if (m.text) return m.text;
  if (m.type === "document") return "Document: " + (m.mediaFilename ?? "Document");
  return MEDIA_LABEL[m.type] ?? "Message";
}
const hhmm = (s: string) => new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function shortWhen(s: string): string {
  const d = new Date(s);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MessageContent({ m }: { m: Msg }) {
  const [gone, setGone] = useState(false);
  const src = `/api/media/${m.id}`;
  const missing = <div className="bubble__missing">Media no longer available — WhatsApp keeps media for about 30 days.</div>;
  if (m.type === "image" || m.type === "sticker") {
    return (
      <>
        {gone ? missing : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="bubble__media" src={src} alt={m.text || (m.type === "sticker" ? "Sticker" : "Photo")} loading="lazy" onError={() => setGone(true)} />
        )}
        {m.text && <div className="bubble__text">{m.text}</div>}
      </>
    );
  }
  if (m.type === "video") {
    return (
      <>
        {gone ? missing : <video className="bubble__media" src={src} controls onError={() => setGone(true)} />}
        {m.text && <div className="bubble__text">{m.text}</div>}
      </>
    );
  }
  if (m.type === "audio") {
    return gone ? missing : <audio className="bubble__audio" src={src} controls onError={() => setGone(true)} />;
  }
  if (m.type === "document") {
    return <a className="bubble__doc" href={src} target="_blank" rel="noreferrer">Document: {m.mediaFilename ?? "Document"}</a>;
  }
  return <div className="bubble__text">{bodyOf(m)}</div>;
}

export default function InboxClient() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [windowOpen, setWindowOpen] = useState(false);
  const [head, setHead] = useState<{ name: string | null; phone: string } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState<TplOption[] | null>(null);
  const [tplId, setTplId] = useState("");
  const [tplVars, setTplVars] = useState<string[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadConvos = useCallback(async () => {
    const r = await apiFetch(`/api/conversations${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
    if (r.ok) setConvos((await r.json()).conversations);
  }, [q]);

  const loadThread = useCallback(async (id: string) => {
    const r = await apiFetch(`/api/conversations/${id}`);
    if (!r.ok) return;
    const j = await r.json();
    setMessages(j.messages);
    setWindowOpen(j.conversation.windowOpen);
    setHead({ name: j.conversation.name, phone: j.conversation.phone });
  }, []);

  useEffect(() => {
    loadConvos();
    const t = setInterval(loadConvos, 5000);
    return () => clearInterval(t);
  }, [loadConvos]);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    const t = setInterval(() => loadThread(activeId), 5000);
    return () => clearInterval(t);
  }, [activeId, loadThread]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeId]);

  function open(id: string) {
    setActiveId(id);
    setErr(null);
    setTplOpen(false);
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }

  async function toggleTplPanel() {
    const next = !tplOpen;
    setTplOpen(next);
    setErr(null);
    if (next && templates === null) {
      const r = await apiFetch("/api/templates");
      if (r.ok) {
        const all = (await r.json()).templates as TplOption[];
        setTemplates(all.filter((t) => t.status === "APPROVED"));
      } else {
        setTemplates([]);
      }
    }
  }

  function onTplChange(id: string) {
    setTplId(id);
    const t = templates?.find((x) => x.id === id);
    setTplVars(Array(t?.variableCount ?? 0).fill(""));
  }

  async function sendTpl() {
    if (!tplId || !activeId) return;
    setBusy(true);
    setErr(null);
    const r = await apiFetch(`/api/conversations/${activeId}/template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: tplId, variables: tplVars }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setTplOpen(false);
      setTplId("");
      setTplVars([]);
      setMessages((m) => [...m, j.message]);
      loadConvos();
    } else {
      setErr(j.error ?? "Could not send template");
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = reply.trim();
    if (!text || !activeId) return;
    setBusy(true);
    setErr(null);
    const r = await apiFetch(`/api/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setReply("");
      setMessages((m) => [...m, j.message]);
      loadConvos();
    } else {
      setErr(j.error ?? "Could not send");
    }
  }

  async function sendFile(file: File) {
    if (!activeId) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    if (reply.trim()) fd.append("caption", reply.trim());
    const r = await apiFetch(`/api/conversations/${activeId}/media`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setReply("");
      setMessages((m) => [...m, j.message]);
      loadConvos();
    } else {
      setErr(j.error ?? "Could not send file");
    }
  }

  return (
    <div className="inbox">
      <aside className="inbox__list">
        <div className="inbox__search">
          <input
            className="input"
            type="search"
            placeholder="Search name, phone, or message..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
        {convos.length === 0 ? (
          <div className="dash-empty">
            {q.trim() ? (
              <>
                <strong>No matches</strong>
                Nothing matches "{q.trim()}" — try a name, phone digits, or message text.
              </>
            ) : (
              <>
                <strong>No conversations yet</strong>
                They appear here the moment a contact replies to one of your messages.
              </>
            )}
          </div>
        ) : (
          convos.map((c) => (
            <button key={c.id} type="button" aria-current={c.id === activeId ? "true" : undefined} className={`convo${c.id === activeId ? " convo--active" : ""}`} onClick={() => open(c.id)}>
              <div className="convo__top">
                <span className="convo__name">{c.name ?? c.phone}</span>
                <span className="convo__when">{shortWhen(c.lastMessageAt)}</span>
              </div>
              <div className="convo__bottom">
                <span className="convo__preview">{c.lastPreview ?? ""}</span>
                {c.unread > 0 && <span className="convo__badge">{c.unread}</span>}
              </div>
            </button>
          ))
        )}
      </aside>

      <section className="inbox__thread">
        {!activeId ? (
          <div className="inbox__empty muted">Select a conversation to read and reply.</div>
        ) : (
          <>
            <header className="thread__head">
              <div className="thread__who">
                <strong>{head?.name ?? head?.phone}</strong>
                {head?.name && <span className="muted"> · {head?.phone}</span>}
              </div>
              <span className={`thread__window thread__window--${windowOpen ? "open" : "closed"}`}>
                {windowOpen && <span className="pulse-dot" aria-hidden />}
                {windowOpen ? "Window open" : "Window closed"}
              </span>
            </header>

            <div className="thread__body" ref={threadRef} aria-live="polite" aria-relevant="additions">
              {messages.map((m) => (
                <div key={m.id} className={`bubble bubble--${m.direction === "OUT" ? "out" : "in"}`}>
                  <MessageContent m={m} />
                  <div className="bubble__meta">
                    {hhmm(m.createdAt)}
                    {m.direction === "OUT" && m.status ? ` · ${m.status.toLowerCase()}` : ""}
                  </div>
                </div>
              ))}
            </div>

            <form className="thread__reply" onSubmit={send}>
              {!windowOpen && !tplOpen && (
                <div className="thread__closed">
                  The 24-hour reply window is closed. Send an approved{" "}
                  <button type="button" className="linklike" onClick={toggleTplPanel}><b>template</b></button> to re-open the conversation.
                </div>
              )}
              {tplOpen && (
                <div className="thread__tplpanel">
                  <label className="label" htmlFor="inbox-tpl">Send an approved template</label>
                  <select id="inbox-tpl" className="input" value={tplId} onChange={(e) => onTplChange(e.target.value)}>
                    <option value="">{templates === null ? "Loading..." : "— choose a template —"}</option>
                    {(templates ?? []).map((t) => (
                      <option key={t.id} value={t.id} disabled={isRichTemplate(t)}>
                        {t.name} ({t.language}) · {t.variableCount} vars{isRichTemplate(t) ? " — use a broadcast" : ""}
                      </option>
                    ))}
                  </select>
                  {tplVars.map((v, i) => (
                    <input key={i} className="input" placeholder={`{{${i + 1}}}`} value={v}
                      onChange={(e) => setTplVars((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))} />
                  ))}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn" onClick={sendTpl}
                      disabled={busy || !tplId || tplVars.some((v) => !v.trim())} aria-busy={busy}>
                      {busy ? "Sending..." : "Send template"}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setTplOpen(false)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                  <p className="note">Templates with media, coupons, or countdowns need per-send inputs — send those from a broadcast.</p>
                </div>
              )}
              <div className="thread__inputrow">
                <button
                  type="button"
                  className="btn btn--ghost thread__attach"
                  onClick={toggleTplPanel}
                  disabled={busy}
                  title="Send a template (works after the 24h window closes)"
                  aria-label="Send a template"
                >
                  TPL
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) sendFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn btn--ghost thread__attach"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  title="Attach a file"
                  aria-label="Attach a file"
                >
                  ATTACH
                </button>
                <input
                  className="input"
                  aria-label="Type a reply"
                  placeholder={windowOpen ? "Type a reply..." : "Window closed — a free-form reply may be rejected"}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <button className="btn" type="submit" disabled={busy || !reply.trim()} aria-busy={busy}>
                  {busy ? "Sending..." : "Send"}
                </button>
              </div>
              {err && <p role="alert" className="note" style={{ color: "var(--danger)", marginTop: 8 }}>{err}</p>}
            </form>
          </>
        )}
      </section>
    </div>
  );
}
