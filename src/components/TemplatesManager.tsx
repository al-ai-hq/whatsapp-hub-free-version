"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { buildTemplatePreview } from "@/lib/templatePreview";
import WaPreview from "@/components/WaPreview";

interface Template { id: string; name: string; language: string; category: string; status: string; variableCount: number }
interface Btn { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE"; text: string; url: string; phoneNumber: string; couponExample: string }
interface Card { format: "IMAGE" | "VIDEO"; mediaUrl: string; body: string; buttonText: string; buttonUrl: string }

const HEADER_FORMATS = [
  { value: "", label: "None" },
  { value: "IMAGE", label: "Image" },
  { value: "DOCUMENT", label: "Document / PDF" },
  { value: "VIDEO", label: "Video" },
] as const;
type HeaderFormat = (typeof HEADER_FORMATS)[number]["value"];

const LANGUAGES = [
  { code: "ar", label: "Arabic (ar)" },
  { code: "en", label: "English (en)" },
  { code: "en_US", label: "English US (en_US)" },
  { code: "en_GB", label: "English UK (en_GB)" },
];
const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;

function statusBadge(s: string) {
  const map: Record<string, string> = { APPROVED: "COMPLETED", PENDING: "SCHEDULED", REJECTED: "FAILED" };
  return `badge badge--${map[s] ?? "PENDING"}`;
}

export default function TemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ar");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("MARKETING");
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>("");
  const [headerExample, setHeaderExample] = useState("");
  const [headerFile, setHeaderFile] = useState("");
  const [headerUploading, setHeaderUploading] = useState(false);
  const [headerErr, setHeaderErr] = useState("");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [carouselOn, setCarouselOn] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [ltoOn, setLtoOn] = useState(false);
  const [ltoText, setLtoText] = useState("");
  const [ltoExpiration, setLtoExpiration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const varCount = useMemo(() => (body.match(/\{\{\d+\}\}/g) ?? []).length, [body]);
  const preview = useMemo(
    () => buildTemplatePreview({
      body, examples, footer, headerFormat, headerFile, buttons, carouselOn, cards, ltoOn, ltoText,
    }),
    [body, examples, footer, headerFormat, headerFile, buttons, carouselOn, cards, ltoOn, ltoText],
  );
  const carouselInvalid =
    carouselOn && (cards.length < 2 || cards.some((c) => !c.mediaUrl.trim() || !c.body.trim()));
  const ltoInvalid =
    ltoOn &&
    (!ltoText.trim() ||
      !buttons.some((b) => b.type === "URL") ||
      buttons.some((b) => b.type === "QUICK_REPLY" || b.type === "PHONE_NUMBER"));

  async function loadTemplates(sync = false) {
    if (sync) setSyncing(true);
    const res = await apiFetch(`/api/templates${sync ? "?sync=1" : ""}`);
    if (sync) setSyncing(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) setTemplates(j.templates ?? []);
    else if (sync) setMsg({ kind: "err", text: j.error ? `Sync failed: ${j.error}` : "Sync failed — check your Meta credentials." });
  }
  useEffect(() => { void loadTemplates(); }, []);

  function setExample(i: number, v: string) {
    setExamples((prev) => { const next = [...prev]; next[i] = v; return next; });
  }
  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "", url: "", phoneNumber: "", couponExample: "" }]);
  }
  function updateButton(i: number, patch: Partial<Btn>) {
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeButton(i: number) {
    setButtons((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addCard() {
    if (cards.length >= 10) return;
    setCards((prev) => [...prev, { format: "IMAGE", mediaUrl: "", body: "", buttonText: "", buttonUrl: "" }]);
  }
  function updateCard(i: number, patch: Partial<Card>) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
  }

  function changeHeaderFormat(f: HeaderFormat) {
    setHeaderFormat(f);
    setHeaderExample(""); setHeaderFile(""); setHeaderErr("");
  }
  function toggleLto(on: boolean) {
    setLtoOn(on);
    if (on) {
      setCarouselOn(false);
      setFooter("");
      if (headerFormat === "DOCUMENT") changeHeaderFormat("");
    }
  }
  function toggleCarousel(on: boolean) {
    setCarouselOn(on);
    if (on) setLtoOn(false);
  }
  async function onHeaderFile(file: File | undefined) {
    if (!file) return;
    setHeaderUploading(true); setHeaderErr(""); setHeaderExample(""); setHeaderFile("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch("/api/templates/media", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setHeaderUploading(false);
    if (res.ok) { setHeaderExample(j.handle); setHeaderFile(file.name); }
    else setHeaderErr(j.error ?? `Upload failed (${res.status})`);
  }
  const headerAccept =
    headerFormat === "IMAGE" ? "image/jpeg,image/png"
    : headerFormat === "DOCUMENT" ? "application/pdf"
    : headerFormat === "VIDEO" ? "video/mp4" : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await apiFetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, language, category, body,
        header: carouselOn || !headerFormat ? undefined : { format: headerFormat, example: headerExample.trim() },
        bodyExamples: examples.slice(0, varCount),
        footer: carouselOn || ltoOn ? undefined : footer.trim() || undefined,
        limitedTimeOffer: ltoOn ? { text: ltoText.trim(), hasExpiration: ltoExpiration } : undefined,
        buttons: carouselOn ? [] : buttons.map((b) => ({
          type: b.type,
          text: b.text || (b.type === "COPY_CODE" ? "Copy code" : b.text),
          url: b.type === "URL" ? b.url : undefined,
          phoneNumber: b.type === "PHONE_NUMBER" ? b.phoneNumber : undefined,
          couponExample: b.type === "COPY_CODE" ? b.couponExample : undefined,
        })),
        carousel: carouselOn
          ? { cards: cards.map((c) => ({ format: c.format, mediaUrl: c.mediaUrl.trim(), body: c.body.trim(), buttonText: c.buttonText.trim() || undefined, buttonUrl: c.buttonUrl.trim() || undefined })) }
          : undefined,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: `Submitted "${j.template.name}" to Meta — status: ${j.template.status}.` });
      setName(""); setBody(""); setExamples([]); setFooter(""); setButtons([]);
      setHeaderFormat(""); setHeaderExample(""); setHeaderFile(""); setHeaderErr("");
      setCarouselOn(false); setCards([]);
      setLtoOn(false); setLtoText(""); setLtoExpiration(false);
      void loadTemplates();
    } else {
      setMsg({ kind: "err", text: j.error ?? `Error ${res.status}` });
    }
  }

  return (
    <div className="grid-forms" style={{ gridTemplateColumns: "minmax(320px,1.1fr) 1fr", alignItems: "start" }}>
      <form onSubmit={onSubmit} className="card">
        <h3>Create a template</h3>
        <div className="field">
          <label className="label" htmlFor="t-name">Name <span className="muted">(lowercase, underscores)</span></label>
          <input id="t-name" data-test-id="tmpl-name" className="input" value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="today_menu" required />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="t-lang">Language</label>
            <select id="t-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="t-cat">Category</label>
            <select id="t-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="t-hdr">Header attachment <span className="muted">(optional — image, document/PDF, or video)</span></label>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <select id="t-hdr" className="input input--sm" style={{ flex: "0 0 auto", width: "auto" }}
              value={headerFormat} onChange={(e) => changeHeaderFormat(e.target.value as HeaderFormat)}>
              {HEADER_FORMATS.filter((h) => !(ltoOn && h.value === "DOCUMENT")).map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            {headerFormat && (
              <input className="input input--sm" type="file" accept={headerAccept} style={{ flex: 1 }}
                disabled={headerUploading}
                onChange={(e) => onHeaderFile(e.target.files?.[0])} />
            )}
          </div>
          {headerFormat && (
            <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {headerUploading ? "Uploading sample to Meta…"
                : headerErr ? <span style={{ color: "var(--danger,#e5484d)" }}>{headerErr}</span>
                : headerExample ? `Sample uploaded${headerFile ? ` — ${headerFile}` : ""}`
                : "Pick a sample file — it's uploaded to Meta to review the template."}
            </p>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="t-body">Body <span className="muted">— use {"{{1}}"}, {"{{2}}"} for variables</span></label>
          <textarea id="t-body" data-test-id="tmpl-body" className="input" style={{ minHeight: 96, resize: "vertical" }}
            value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hello {{1}}, today's menu is ready!" required />
        </div>
        {varCount > 0 && (
          <div className="field" role="group" aria-labelledby="tmpl-examples-lbl">
            <div className="label" id="tmpl-examples-lbl">Example values <span className="muted">(Meta requires one per variable)</span></div>
            {Array.from({ length: varCount }, (_, i) => (
              <input key={i} className="input input--sm" style={{ marginBottom: 6 }} value={examples[i] ?? ""}
                aria-label={`Example for variable ${i + 1}`}
                onChange={(e) => setExample(i, e.target.value)} placeholder={`Example for {{${i + 1}}}`} />
            ))}
          </div>
        )}
        {!ltoOn && (
          <div className="field">
            <label className="label" htmlFor="t-footer">Footer <span className="muted">(optional)</span></label>
            <input id="t-footer" className="input" value={footer} maxLength={60}
              onChange={(e) => setFooter(e.target.value)} placeholder="Reply STOP to opt out" />
          </div>
        )}
        <div className="field" role="group" aria-labelledby="tmpl-buttons-lbl">
          <div className="label" id="tmpl-buttons-lbl">Buttons <span className="muted">(optional, up to 3)</span></div>
          {buttons.map((b, i) => (
            <div key={i} className="row" style={{ gap: 8, marginBottom: 8 }}>
              <select className="input input--sm" style={{ flex: "0 0 auto", width: "auto" }} value={b.type}
                aria-label={`Button ${i + 1} type`}
                onChange={(e) => updateButton(i, { type: e.target.value as Btn["type"] })}>
                <option value="QUICK_REPLY">Quick reply</option>
                <option value="URL">URL</option>
                <option value="PHONE_NUMBER">Call (phone)</option>
                <option value="COPY_CODE">Copy code (coupon)</option>
              </select>
              {b.type !== "COPY_CODE" && (
                <input className="input input--sm" style={{ flex: 1 }} value={b.text} placeholder="Button text"
                  aria-label={`Button ${i + 1} text`}
                  maxLength={25} onChange={(e) => updateButton(i, { text: e.target.value })} />
              )}
              {b.type === "URL" && (
                <input className="input input--sm" style={{ flex: 1 }} value={b.url} placeholder="https://..."
                  aria-label={`Button ${i + 1} URL`}
                  onChange={(e) => updateButton(i, { url: e.target.value })} />
              )}
              {b.type === "PHONE_NUMBER" && (
                <span style={{ flex: 1 }}>
                  <input className="input input--sm" style={{ width: "100%" }} value={b.phoneNumber}
                    placeholder="+962798960079"
                    aria-label={`Button ${i + 1} phone number`}
                    aria-describedby={`btn-phone-hint-${i}`}
                    onChange={(e) => updateButton(i, { phoneNumber: e.target.value })} />
                  <span id={`btn-phone-hint-${i}`} className="note">
                    Country code required, and drop the leading 0 — <code>079...</code> becomes <code>+96279...</code>.
                  </span>
                </span>
              )}
              {b.type === "COPY_CODE" && (
                <input className="input input--sm" style={{ flex: 1 }} value={b.couponExample} placeholder="Sample code e.g. SAVE20"
                  aria-label={`Button ${i + 1} coupon code`}
                  maxLength={15} onChange={(e) => updateButton(i, { couponExample: e.target.value })} />
              )}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeButton(i)} aria-label={`Remove button ${i + 1}`}>X</button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={addButton}>+ Add button</button>
          )}
        </div>

        <div className="field">
          <label className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={ltoOn} onChange={(e) => toggleLto(e.target.checked)} />
            Limited-time offer <span className="muted">— an offer banner above the body, with an optional countdown</span>
          </label>
          {ltoOn && (
            <div style={{ marginTop: 8 }}>
              <input className="input input--sm" style={{ marginBottom: 8, width: "100%" }} value={ltoText}
                data-test-id="tmpl-lto-text" maxLength={16} placeholder="Offer text, e.g. Expiring offer!"
                onChange={(e) => setLtoText(e.target.value)} />
              <label className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={ltoExpiration} onChange={(e) => setLtoExpiration(e.target.checked)} />
                Show a countdown timer <span className="muted">— each broadcast supplies the expiry time</span>
              </label>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Needs a URL button below{ltoExpiration ? " (add a copy-code button to include a coupon)" : ""}; quick-reply and call buttons aren&apos;t allowed.
              </p>
            </div>
          )}
        </div>

        <div className="field">
          <label className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={carouselOn} onChange={(e) => toggleCarousel(e.target.checked)} />
            Carousel (media cards) <span className="muted">— replaces the header &amp; buttons above; 2-10 cards, each with a public media URL</span>
          </label>
          {carouselOn && (
            <div style={{ marginTop: 8 }}>
              {cards.map((c, i) => (
                <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Card {i + 1}</strong>
                    <span className="spacer" />
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeCard(i)} aria-label="Remove card">X</button>
                  </div>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <select className="input input--sm" style={{ flex: "0 0 auto", width: "auto" }} value={c.format}
                      onChange={(e) => updateCard(i, { format: e.target.value as Card["format"] })}>
                      <option value="IMAGE">Image</option>
                      <option value="VIDEO">Video</option>
                    </select>
                    <input className="input input--sm" style={{ flex: 1 }} value={c.mediaUrl} placeholder="Public media URL (https://...)"
                      onChange={(e) => updateCard(i, { mediaUrl: e.target.value })} />
                  </div>
                  <input className="input input--sm" style={{ marginBottom: 8, width: "100%" }} value={c.body} placeholder="Card text" maxLength={160}
                    onChange={(e) => updateCard(i, { body: e.target.value })} />
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input input--sm" style={{ flex: 1 }} value={c.buttonText} placeholder="Button text (optional)" maxLength={25}
                      onChange={(e) => updateCard(i, { buttonText: e.target.value })} />
                    <input className="input input--sm" style={{ flex: 1 }} value={c.buttonUrl} placeholder="Button URL (optional)"
                      onChange={(e) => updateCard(i, { buttonUrl: e.target.value })} />
                  </div>
                </div>
              ))}
              {cards.length < 10 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={addCard}>+ Add card</button>
              )}
            </div>
          )}
        </div>

        <div className="field">
          <label className="label">
            Preview <span className="muted">— how this looks in WhatsApp, before you submit it to Meta</span>
          </label>
          {body.trim() ? (
            <>
              <div data-test-id="tmpl-preview">
                <WaPreview model={preview} headerSet={!!headerExample} />
              </div>
              <p className="note" style={{ marginTop: 6 }}>
                Variables show your example values — the same ones Meta&apos;s reviewer sees.
                {varCount > 0 && examples.slice(0, varCount).some((e) => !e?.trim())
                  ? " Any {{n}} still showing means that example is blank."
                  : ""}
              </p>
            </>
          ) : (
            <p className="note">Write the body above and the preview appears here.</p>
          )}
        </div>

        <button data-test-id="tmpl-submit" className="btn" type="submit"
          disabled={busy || !name || !body || headerUploading || (!carouselOn && !!headerFormat && !headerExample) || carouselInvalid || ltoInvalid} aria-busy={busy}>
          {busy ? "Submitting to Meta..." : "Submit to Meta"}
        </button>
        {msg && (
          <p data-test-id="tmpl-result" className="note" style={{ marginTop: 10, color: msg.kind === "ok" ? "var(--green)" : "var(--danger)" }}>
            {msg.text}
          </p>
        )}
      </form>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Your templates</h3>
          <button className="btn btn--ghost btn--sm" onClick={() => loadTemplates(true)} disabled={syncing} aria-busy={syncing}>
            {syncing ? "Syncing..." : "Sync from Meta"}
          </button>
        </div>
        <table className="table" data-test-id="templates-table">
          <thead><tr><th>Name</th><th>Lang</th><th>Category</th><th>Status</th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}{t.variableCount > 0 ? <span className="muted"> · {t.variableCount} var</span> : null}</td>
                <td>{t.language}</td>
                <td className="muted">{t.category}</td>
                <td><span className={statusBadge(t.status)}>{t.status}</span></td>
              </tr>
            ))}
            {templates.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No templates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
