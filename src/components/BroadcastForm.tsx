"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { substituteTemplateVars, previewVarValue, type PreviewModel } from "@/lib/templatePreview";
import WaPreview from "@/components/WaPreview";

interface List { id: string; name: string }
interface Template {
  id: string; name: string; language: string; variableCount: number;
  headerFormat?: string | null; copyCode?: boolean; ltoExpiration?: boolean; cards?: unknown;
  bodyText?: string | null; footerText?: string | null; buttons?: unknown; ltoText?: string | null;
}

interface CardDef { format: string; mediaUrl: string; body?: string; buttonText?: string }
interface ButtonDef { type: string; text?: string; url?: string }
function cardsOf(t: Template | undefined): CardDef[] | null {
  return t && Array.isArray(t.cards) && t.cards.length > 0 ? (t.cards as CardDef[]) : null;
}

export default function BroadcastForm({ lists, templates }: { lists: List[]; templates: Template[] }) {
  const [templateId, setTemplateId] = useState("");
  const [listId, setListId] = useState("");
  const [vars, setVars] = useState<string[]>([]);
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [cardUrls, setCardUrls] = useState<string[]>([]);
  const [ltoExpiresAt, setLtoExpiresAt] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => templates.find((t) => t.id === templateId), [templateId, templates]);
  const mediaHeader = !!selected && ["IMAGE", "DOCUMENT", "VIDEO"].includes(selected.headerFormat ?? "");
  const needsCoupon = !!selected?.copyCode;
  const needsLtoExpiry = !!selected?.ltoExpiration;
  const cards = useMemo(() => cardsOf(selected), [selected]);
  const previewBody = selected?.bodyText
    ? substituteTemplateVars(selected.bodyText, vars.map(previewVarValue))
    : null;
  const previewButtons: ButtonDef[] = Array.isArray(selected?.buttons) ? (selected.buttons as ButtonDef[]) : [];

  const previewModel: PreviewModel | null = selected && previewBody !== null ? {
    headerFormat: mediaHeader ? selected.headerFormat ?? null : null,
    headerLabel: mediaHeader
      ? headerMediaUrl.trim()
        ? headerMediaUrl.trim().split("/").pop()?.split("?")[0] || "media"
        : `${selected.headerFormat?.toLowerCase()} header — paste the media URL above`
      : null,
    ltoText: selected.ltoText ?? null,
    body: previewBody,
    footer: selected.footerText ?? null,
    buttons: previewButtons.map((b) => ({
      type: b.type,
      text: b.type === "COPY_CODE" ? couponCode.trim() || b.text || "Copy code" : b.text ?? "",
    })),
    cards: cards
      ? cards.map((c, i) => ({
          format: c.format,
          body: c.body,
          buttonText: c.buttonText,
          mediaLabel: cardUrls[i]?.trim() ? "new media" : "template media",
        }))
      : null,
  } : null;

  function onTemplateChange(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setVars(Array(t?.variableCount ?? 0).fill(""));
    setHeaderMediaUrl("");
    setCouponCode("");
    setCardUrls(Array(cardsOf(t)?.length ?? 0).fill(""));
    setLtoExpiresAt("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const variableMap = vars.map((v) => (v.startsWith("field:") ? { from: v.slice(6).trim() } : { literal: v }));
    const body: Record<string, unknown> = { templateId, listId, variableMap };
    if (mediaHeader && headerMediaUrl.trim()) body.headerMediaUrl = headerMediaUrl.trim();
    if (needsCoupon && couponCode.trim()) body.couponCode = couponCode.trim();
    if (cards && cardUrls.some((u) => u.trim())) body.cardMediaUrls = cardUrls.map((u) => u.trim());
    if (needsLtoExpiry && ltoExpiresAt) body.ltoExpiresAt = new Date(ltoExpiresAt).toISOString();
    if (scheduleAt) body.scheduleAt = new Date(scheduleAt).toISOString();

    const res = await apiFetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(
      res.ok
        ? j.scheduledAt
          ? `Scheduled ${j.queued} messages for ${new Date(j.scheduledAt).toLocaleString()}.`
          : `Queued ${j.queued} messages now.`
        : `Error: ${j.error ?? res.status}`,
    );
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>New broadcast</h3>

      <div className="field">
        <label className="label" htmlFor="tpl">Template (approved only)</label>
        <select id="tpl" data-test-id="bc-template" className="input" value={templateId} onChange={(e) => onTemplateChange(e.target.value)} required>
          <option value="">— choose —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language}) · {t.variableCount} vars</option>)}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="lst">Recipient list</label>
        <select id="lst" data-test-id="bc-list" className="input" value={listId} onChange={(e) => setListId(e.target.value)} required>
          <option value="">— choose —</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {mediaHeader && (
        <div className="field">
          <label className="label" htmlFor="bc-hdr">
            Header media URL <span className="muted">— this template has a {selected?.headerFormat?.toLowerCase()} header</span>
          </label>
          <input id="bc-hdr" data-test-id="bc-header-media" className="input" type="url" value={headerMediaUrl}
            onChange={(e) => setHeaderMediaUrl(e.target.value)}
            placeholder="https://... (public link to the image/PDF/video)" required />
        </div>
      )}

      {needsCoupon && (
        <div className="field">
          <label className="label" htmlFor="bc-coupon">
            Coupon code <span className="muted">— this template has a copy-code button</span>
          </label>
          <input id="bc-coupon" data-test-id="bc-coupon" className="input" value={couponCode}
            maxLength={15} onChange={(e) => setCouponCode(e.target.value)} placeholder="e.g. SAVE20" required />
        </div>
      )}

      {cards && (
        <div className="field">
          <label className="label">
            Carousel card media <span className="muted">— optional per-send overrides; blank keeps the template&apos;s media</span>
          </label>
          {cards.map((c, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <input data-test-id={`bc-card-${i + 1}`} className="input" type="url" value={cardUrls[i] ?? ""}
                onChange={(e) => setCardUrls((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                placeholder={c.mediaUrl} />
              <span className="note">Card {i + 1} · {c.format.toLowerCase()}{c.body ? ` · "${c.body}"` : ""}</span>
            </div>
          ))}
        </div>
      )}

      {needsLtoExpiry && (
        <div className="field">
          <label className="label" htmlFor="bc-lto">
            Offer expires at <span className="muted">— this template shows a countdown timer</span>
          </label>
          <input id="bc-lto" data-test-id="bc-lto-expiry" className="input" type="datetime-local" value={ltoExpiresAt}
            onChange={(e) => setLtoExpiresAt(e.target.value)} required />
        </div>
      )}

      {selected && selected.variableCount > 0 && (
        <div className="field">
          <label className="label">
            Template variables — literal text, or <code>field:name</code> / <code>field:city</code> to pull per-contact
          </label>
          {vars.map((v, i) => (
            <input key={i} data-test-id={`bc-var-${i + 1}`} className="input" placeholder={`{{${i + 1}}}`}
              value={v} onChange={(e) => setVars((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
              style={{ marginBottom: 8 }} />
          ))}
        </div>
      )}

      {selected && (
        <div className="field">
          <label className="label">
            Message preview <span className="muted">— what recipients will see; updates as you type</span>
          </label>
          {previewModel ? (
            <WaPreview model={previewModel} headerSet={!!headerMediaUrl.trim()} />
          ) : (
            <p className="note">
              No preview for this template yet — its message text hasn&apos;t been cached locally. Open <b>Templates</b> and
              sync to pull it from Meta.
            </p>
          )}
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="sch">Schedule (optional — blank = send now)</label>
        <input id="sch" data-test-id="bc-schedule" className="input" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
      </div>

      <button data-test-id="bc-submit" className="btn" type="submit"
        disabled={busy || !templateId || !listId || (mediaHeader && !headerMediaUrl.trim()) || (needsCoupon && !couponCode.trim()) || (needsLtoExpiry && !ltoExpiresAt)} aria-busy={busy}>
        {busy ? "Submitting…" : scheduleAt ? "Schedule broadcast" : "Send now"}
      </button>
      {msg && <p data-test-id="bc-result" className="note" style={{ marginTop: 10 }}>{msg}</p>}
    </form>
  );
}
