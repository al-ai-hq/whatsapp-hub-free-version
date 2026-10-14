"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useMe } from "@/lib/useRole";

/**
 * Change your own password.
 * Succeeding signs every session out, so we send the user back to /login.
 */
export default function ChangePasswordForm() {
  const me = useMe();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirmation) { setError("The two new passwords do not match."); return; }
    setBusy(true); setError(null);
    const res = await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      window.location.href = "/login?next=/settings";
    } else {
      setError(j.error ?? "Could not change the password");
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h3>Change my password</h3>
      <p className="note" style={{ marginBottom: 12 }}>
        {me?.email ? `Signed in as ${me.email}. ` : ""}
        Changing it signs you out of every device — sign back in with the new password.
      </p>
      <div className="field">
        <label className="label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="input" data-test-id="pw-current" type="password"
          autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-new">New password (at least 8 chars)</label>
        <input id="pw-new" className="input" data-test-id="pw-new" type="password"
          autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-confirm">Repeat the new password</label>
        <input id="pw-confirm" className="input" type="password" autoComplete="new-password" minLength={8}
          value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
      </div>
      <button className="btn" type="submit" data-test-id="pw-submit" disabled={busy || !current || next.length < 8}>
        {busy ? "Changing..." : "Change password"}
      </button>
      {error && <p className="note" style={{ marginTop: 10, color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
