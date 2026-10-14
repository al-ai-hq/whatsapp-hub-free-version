"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { COUNTRY_CODES, toE164 } from "@/lib/phone";

interface List { id: string; name: string }

export default function AddContactForm({ lists }: { lists: List[] }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]!.code);
  const [national, setNational] = useState("");
  const [listIds, setListIds] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleList(id: string) {
    setListIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Live E.164 preview so the country code is never a surprise.
  const e164 = national.trim() ? toE164(countryCode, national) : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await apiFetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName: lastName.trim() || undefined,
        phone: e164,
        listIds: [...listIds],
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: `Added ${j.contact?.name ?? firstName} (${j.contact?.phone}).` });
      setFirstName("");
      setLastName("");
      setNational("");
    } else {
      setMsg({ kind: "err", text: j.error ?? `Error ${res.status}` });
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>Add a contact</h3>

      <div className="field">
        <label className="label" htmlFor="firstName">First name</label>
        <input id="firstName" data-test-id="add-first-name" className="input" value={firstName}
          onChange={(e) => setFirstName(e.target.value)} maxLength={60} required />
      </div>

      <div className="field">
        <label className="label" htmlFor="lastName">Last name <span className="muted">(optional)</span></label>
        <input id="lastName" data-test-id="add-last-name" className="input" value={lastName}
          onChange={(e) => setLastName(e.target.value)} maxLength={60} />
      </div>

      <div className="field">
        <label className="label" htmlFor="national">Phone number</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select aria-label="Country code" data-test-id="add-country-code" className="input"
            style={{ flex: "0 0 auto", width: "auto" }} value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}>
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} +{c.code} {c.name}</option>
            ))}
          </select>
          <input id="national" data-test-id="add-phone" className="input" style={{ flex: 1 }}
            type="tel" inputMode="tel" placeholder="50 000 0001" value={national}
            onChange={(e) => setNational(e.target.value)} required />
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          {e164
            ? <>Will be saved as <code data-test-id="add-phone-preview">{e164}</code> (E.164, no "+").</>
            : <>Pick the country code, then enter the local number. A leading 0 is dropped automatically.</>}
        </p>
      </div>

      <div className="field">
        <span className="label" id="add-lists-lbl">Add to lists <span className="muted">(optional — pick any number)</span></span>
        {lists.length === 0 ? (
          <p className="note">No lists yet. Create one on the Lists page first.</p>
        ) : (
          <div className="ct-lists" role="group" aria-labelledby="add-lists-lbl" data-test-id="add-lists">
            {lists.map((l) => (
              <label key={l.id} className="ct-lists__opt">
                <input type="checkbox" data-test-id="add-list-option"
                  checked={listIds.has(l.id)} onChange={() => toggleList(l.id)} />
                {l.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <button data-test-id="add-submit" className="btn" type="submit" disabled={busy || !firstName || !national} aria-busy={busy}>
        {busy ? "Adding…" : "Add contact"}
      </button>
      {msg && (
        <p data-test-id="add-result" className="note"
          style={{ marginTop: 10, color: msg.kind === "ok" ? "var(--green)" : "var(--danger)" }}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
