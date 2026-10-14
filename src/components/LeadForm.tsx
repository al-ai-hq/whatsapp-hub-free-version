"use client";

import { useState } from "react";

// Lead-capture form for the public landing page.
// Submits a WhatsApp number; the server stores it for follow-up.
export default function LeadForm() {
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState(""); // honeypot — bots fill this, humans don't
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hp) return; // bot detected
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Something went wrong");
        return;
      }
      setDone(true);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <p className="dk-form__done">Thanks! We&apos;ll message you soon.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="dk-form">
      <label className="dk-form__hp" aria-hidden="true">
        Website
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </label>
      <input
        className="dk-form__input"
        type="tel"
        placeholder="Your WhatsApp number (e.g. +96279...)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      {err && <p className="dk-form__err">{err}</p>}
      <button className="dk-btn dk-btn--primary" type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send my number"}
      </button>
    </form>
  );
}
