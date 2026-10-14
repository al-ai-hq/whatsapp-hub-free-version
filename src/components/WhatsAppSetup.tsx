"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Status {
  phoneNumberId: string;
  businessAccountId: string;
  appId: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  savedAt: string | null;
}

export default function WhatsAppSetup() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [appId, setAppId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [graphApiVersion, setGraphApiVersion] = useState("v21.0");
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasAppSecret, setHasAppSecret] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [test, setTest] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function applyStatus(s: Status) {
    setPhoneNumberId(s.phoneNumberId);
    setBusinessAccountId(s.businessAccountId);
    setAppId(s.appId);
    setWebhookVerifyToken(s.webhookVerifyToken);
    setGraphApiVersion(s.graphApiVersion || "v21.0");
    setHasAccessToken(s.hasAccessToken);
    setHasAppSecret(s.hasAppSecret);
    setSavedAt(s.savedAt);
  }

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhooks/whatsapp`);
    (async () => {
      const res = await apiFetch("/api/settings/whatsapp");
      if (res.ok) applyStatus(await res.json());
    })();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await apiFetch("/api/settings/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumberId, businessAccountId, appId, webhookVerifyToken, graphApiVersion,
        ...(accessToken ? { accessToken } : {}),
        ...(appSecret ? { appSecret } : {}),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      applyStatus(j);
      setAccessToken(""); setAppSecret("");
      setMsg({ kind: "ok", text: "Saved. The app now uses these credentials." });
    } else setMsg({ kind: "err", text: j.error ?? `Error ${res.status}` });
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    const res = await apiFetch("/api/settings/whatsapp/test", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setTesting(false);
    if (j.ok) setTest({ kind: "ok", text: `Connected ${j.name ?? ""} ${j.phone ? `(${j.phone})` : ""}`.trim() });
    else setTest({ kind: "err", text: j.error ?? "Connection failed" });
  }

  function copyWebhook() { navigator.clipboard?.writeText(webhookUrl).catch(() => {}); }
  function genToken() {
    const t = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
    setWebhookVerifyToken(t);
  }

  return (
    <form onSubmit={onSave} className="card" style={{ maxWidth: 680 }} autoComplete="off">
      <h3>Connect WhatsApp</h3>
      <p className="note" style={{ margin: "0 0 16px" }}>
        Enter the values from your Meta app (WhatsApp → API setup). Saved settings override the server&rsquo;s
        defaults — no redeploy needed. {savedAt && <>Last saved {new Date(savedAt).toLocaleString()}.</>}
      </p>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="label" htmlFor="pn">Phone number ID <span className="muted">— from WhatsApp → API Setup, not the phone number itself</span></label>
          <input id="pn" data-test-id="wa-phone-id" className="input" value={phoneNumberId} autoComplete="off"
            onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="label" htmlFor="waba">WhatsApp Business Account ID (WABA) <span className="muted">— from API Setup, not your Business Portfolio ID</span></label>
          <input id="waba" className="input" value={businessAccountId} autoComplete="off"
            onChange={(e) => setBusinessAccountId(e.target.value)} placeholder="123456789012345" />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="appid">App ID <span className="muted">— Meta app, needed to upload template media</span></label>
        <input id="appid" className="input" value={appId} autoComplete="off"
          onChange={(e) => setAppId(e.target.value)} placeholder="123456789012345" />
      </div>

      <div className="field">
        <label className="label" htmlFor="tok">Access token {hasAccessToken && <span className="muted">· saved</span>}</label>
        <input id="tok" data-test-id="wa-token" className="input" type="password" value={accessToken} autoComplete="new-password"
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={hasAccessToken ? "saved — leave blank to keep" : "EAAG... permanent system-user token"} />
      </div>

      <div className="field">
        <label className="label" htmlFor="sec">App secret {hasAppSecret && <span className="muted">· saved</span>}</label>
        <input id="sec" className="input" type="password" value={appSecret} autoComplete="new-password"
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder={hasAppSecret ? "saved — leave blank to keep" : "used to verify webhook signatures"} />
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="label" htmlFor="vt">Webhook verify token</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="vt" className="input" style={{ flex: 1 }} value={webhookVerifyToken}
              onChange={(e) => setWebhookVerifyToken(e.target.value)} placeholder="a long random string" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={genToken}>Generate</button>
          </div>
        </div>
        <div className="field" style={{ flex: "0 0 140px" }}>
          <label className="label" htmlFor="ver">API version</label>
          <input id="ver" className="input" value={graphApiVersion}
            onChange={(e) => setGraphApiVersion(e.target.value)} placeholder="v21.0" />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="wa-webhook">Webhook callback URL <span className="muted">— paste this into Meta</span></label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="wa-webhook" className="input" readOnly value={webhookUrl} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={copyWebhook}>Copy</button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <button data-test-id="wa-save" className="btn" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving..." : "Save settings"}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={runTest} disabled={testing} aria-busy={testing}>
          {testing ? "Testing..." : "Test connection"}
        </button>
        {msg && <span className="note" style={{ color: msg.kind === "ok" ? "var(--green)" : "var(--danger)" }}>{msg.text}</span>}
        {test && <span className="note" data-test-id="wa-test-result" style={{ color: test.kind === "ok" ? "var(--green)" : "var(--danger)" }}>{test.text}</span>}
      </div>
    </form>
  );
}
