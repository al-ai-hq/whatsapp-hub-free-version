import { getWaConfig } from "./waConfig";

export interface TemplateComponent {
  type: "body";
  parameters: { type: "text"; text: string }[];
}

/**
 * Build the Cloud API template message payload.
 * Pure function — unit-tested without network access.
 */
export function buildTemplatePayload(args: {
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
  // When the template has a media header, the actual media is supplied per-send.
  headerFormat?: string | null; // IMAGE | DOCUMENT | VIDEO
  headerMediaUrl?: string | null;
  // Coupon code for a COPY_CODE button (assumed at button index 0).
  couponCode?: string | null;
  // Carousel cards: each card's media is supplied per-send (body/buttons are static).
  carouselCards?: { format: string; mediaUrl: string }[] | null;
  // Limited-time offer countdown expiry (epoch ms) — required when the template
  // was created with has_expiration.
  ltoExpiryMs?: number | null;
}) {
  const components: Record<string, unknown>[] = [];

  // Media header component (image/document/video) — Meta requires the media on send.
  if (args.headerFormat && args.headerMediaUrl) {
    const kind = args.headerFormat.toLowerCase(); // image | document | video
    components.push({
      type: "header",
      parameters: [{ type: kind, [kind]: { link: args.headerMediaUrl } }],
    });
  }

  // Limited-time offer countdown — the expiry is supplied per-send.
  if (args.ltoExpiryMs) {
    components.push({
      type: "limited_time_offer",
      parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: args.ltoExpiryMs } }],
    });
  }

  if (args.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: args.bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  // Copy-code (coupon) button — the code is supplied per-send.
  if (args.couponCode) {
    components.push({
      type: "button",
      sub_type: "copy_code",
      index: "0",
      parameters: [{ type: "coupon_code", coupon_code: args.couponCode }],
    });
  }

  // Carousel — supply each card's media (body/buttons are baked into the template).
  if (args.carouselCards && args.carouselCards.length > 0) {
    components.push({
      type: "carousel",
      cards: args.carouselCards.map((c, i) => {
        const kind = c.format.toLowerCase(); // image | video
        return {
          card_index: i,
          components: [{ type: "header", parameters: [{ type: kind, [kind]: { link: c.mediaUrl } }] }],
        };
      }),
    });
  }

  return {
    messaging_product: "whatsapp",
    to: args.to,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.language },
      ...(components.length ? { components } : {}),
    },
  } as const;
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

/** Returns the Meta message id (wamid) on success. Throws WhatsAppError otherwise. */
export async function sendTemplate(args: {
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
  headerFormat?: string | null;
  headerMediaUrl?: string | null;
  couponCode?: string | null;
  carouselCards?: { format: string; mediaUrl: string }[] | null;
  ltoExpiryMs?: number | null;
}): Promise<string> {
  const cfg = await getWaConfig();
  const res = await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildTemplatePayload(args)),
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };

  if (!res.ok) {
    // 429 (rate) and 5xx are transient → retryable. 4xx (bad number, paused template) → permanent.
    const retryable = res.status === 429 || res.status >= 500;
    throw new WhatsAppError(
      json.error?.message ?? `WA send failed (${res.status})`,
      res.status,
      retryable,
    );
  }

  const wamid = json.messages?.[0]?.id;
  if (!wamid) throw new WhatsAppError("No wamid in response", 500, true);
  return wamid;
}

/** Send a free-form text message (only allowed within the 24h service window).
 *  Returns the wamid. Throws WhatsAppError (e.g. 131047 when the window closed). */
export async function sendText(args: { to: string; body: string }): Promise<string> {
  const cfg = await getWaConfig();
  const res = await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "text",
      text: { body: args.body },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new WhatsAppError(json.error?.message ?? `WA send failed (${res.status})`, res.status, retryable);
  }
  const wamid = json.messages?.[0]?.id;
  if (!wamid) throw new WhatsAppError("No wamid in response", 500, true);
  return wamid;
}

/** Send a read receipt for an inbound message. Best-effort (never throws). */
export async function sendReadReceipt(wamid: string): Promise<void> {
  try {
    const cfg = await getWaConfig();
    await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }),
    });
  } catch {
    /* read receipts are non-critical */
  }
}

export type MediaFetchResult =
  | { ok: true; bytes: ArrayBuffer; mime: string }
  // gone = Meta no longer has the media (it retains message media ~30 days);
  // otherwise the failure is transient (network, rate limit, expired temp URL).
  | { ok: false; gone: boolean };

/** Resolve a media id → its bytes (two-step: get the temp URL, then download). */
export async function fetchMediaBytes(mediaId: string): Promise<MediaFetchResult> {
  const cfg = await getWaConfig();
  const auth = { Authorization: `Bearer ${cfg.accessToken}` };
  const metaRes = await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${mediaId}`, { headers: auth });
  // 400/404 on the id lookup = the media has aged out (or the id is bogus).
  if (!metaRes.ok) return { ok: false, gone: metaRes.status === 400 || metaRes.status === 404 };
  const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
  if (!meta.url) return { ok: false, gone: true };
  const bin = await fetch(meta.url, { headers: auth }); // the URL itself also needs the token
  if (!bin.ok) return { ok: false, gone: false }; // temp URL hiccup → retryable
  return { ok: true, bytes: await bin.arrayBuffer(), mime: meta.mime_type || "application/octet-stream" };
}

/** Upload a file to the messages media store; returns the media id. */
export async function uploadMedia(bytes: ArrayBuffer, mime: string, filename: string): Promise<string> {
  const cfg = await getWaConfig();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new WhatsAppError(json.error?.message ?? `media upload failed (${res.status})`, res.status, false);
  return json.id;
}

/** Send a media message (by media id). Returns the wamid. */
export async function sendMedia(args: {
  to: string;
  type: "image" | "document" | "audio" | "video";
  mediaId: string;
  caption?: string;
  filename?: string;
}): Promise<string> {
  const cfg = await getWaConfig();
  const media: Record<string, unknown> = { id: args.mediaId };
  if (args.caption && args.type !== "audio") media.caption = args.caption;
  if (args.filename && args.type === "document") media.filename = args.filename;
  const res = await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: args.to, type: args.type, [args.type]: media }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new WhatsAppError(json.error?.message ?? `WA media send failed (${res.status})`, res.status, retryable);
  }
  const wamid = json.messages?.[0]?.id;
  if (!wamid) throw new WhatsAppError("No wamid in response", 500, true);
  return wamid;
}

// ── Template creation (submit for Meta approval) ─────────────────────
export interface TemplateButtonInput {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
  text: string;
  url?: string;
  phoneNumber?: string;
  couponExample?: string; // sample coupon code (COPY_CODE buttons, for approval)
}
export interface TemplateHeaderInput { format: "IMAGE" | "DOCUMENT" | "VIDEO"; example: string }
// A carousel card: media header (handle for approval) + static body + optional URL button.
export interface CarouselCardInput {
  format: "IMAGE" | "VIDEO";
  example: string; // media handle for the create-time sample
  body: string;
  buttonText?: string;
  buttonUrl?: string;
}
export interface CreateTemplateInput {
  name: string;
  language: string;
  category: string;
  header?: TemplateHeaderInput;
  body: string;
  bodyExamples: string[];
  footer?: string;
  buttons: TemplateButtonInput[];
  carousel?: { cards: CarouselCardInput[] };
  // Limited-time offer: banner text (≤16 chars, no variables) + optional countdown.
  limitedTimeOffer?: { text: string; hasExpiration: boolean };
}

/** Count {{n}} placeholders in a template body. */
export function countTemplateVars(body: string): number {
  return (body.match(/\{\{\d+\}\}/g) ?? []).length;
}

/**
 * Build the `components` array for the Cloud API message_templates payload.
 * Pure function — unit-tested without network access.
 */
export function buildTemplateComponents(input: CreateTemplateInput): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];

  // Media header (attachment). Meta wants a sample under example.header_handle.
  if (input.header) {
    components.push({
      type: "HEADER",
      format: input.header.format,
      example: { header_handle: [input.header.example] },
    });
  }

  // Limited-time offer banner. Meta's component order: header, LTO, body, buttons.
  if (input.limitedTimeOffer) {
    components.push({
      type: "LIMITED_TIME_OFFER",
      limited_time_offer: { text: input.limitedTimeOffer.text, has_expiration: input.limitedTimeOffer.hasExpiration },
    });
  }

  const body: Record<string, unknown> = { type: "BODY", text: input.body };
  const varCount = countTemplateVars(input.body);
  if (varCount > 0) {
    // Meta wants one example row covering every {{n}}.
    body.example = { body_text: [input.bodyExamples.slice(0, varCount)] };
  }
  components.push(body);

  if (input.footer) components.push({ type: "FOOTER", text: input.footer });

  if (input.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((b) => {
        if (b.type === "URL") return { type: "URL", text: b.text, url: b.url };
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber };
        if (b.type === "COPY_CODE") return { type: "COPY_CODE", example: b.couponExample };
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  // Carousel: a CAROUSEL component with 2–10 cards (each a media header + static
  // body + optional URL button). Top-level body above comes from input.body.
  if (input.carousel && input.carousel.cards.length > 0) {
    components.push({
      type: "CAROUSEL",
      cards: input.carousel.cards.map((card) => ({
        components: [
          { type: "HEADER", format: card.format, example: { header_handle: [card.example] } },
          { type: "BODY", text: card.body },
          ...(card.buttonText && card.buttonUrl
            ? [{ type: "BUTTONS", buttons: [{ type: "URL", text: card.buttonText, url: card.buttonUrl }] }]
            : []),
        ],
      })),
    });
  }
  return components;
}

/**
 * Upload a sample file to Meta's Resumable Upload API and return a media handle
 * for use as a template header sample (example.header_handle). Two steps:
 * create an upload session, then upload the bytes from offset 0.
 */
export async function uploadTemplateMedia(
  bytes: ArrayBuffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const cfg = await getWaConfig();
  if (!cfg.appId) {
    throw new WhatsAppError("Set the Meta App ID in Settings → Connect WhatsApp to upload media.", 400, false);
  }
  const base = `https://graph.facebook.com/${cfg.graphApiVersion}`;
  // 1) create an upload session
  const q = new URLSearchParams({ file_name: fileName, file_length: String(bytes.byteLength), file_type: mimeType });
  const sessRes = await fetch(`${base}/${cfg.appId}/uploads?${q.toString()}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${cfg.accessToken}` },
  });
  const sess = (await sessRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!sessRes.ok || !sess.id) {
    throw new WhatsAppError(sess.error?.message ?? `upload session failed (${sessRes.status})`, sessRes.status, false);
  }
  // 2) upload the bytes (single shot from offset 0) — returns the handle in `h`
  const upRes = await fetch(`${base}/${sess.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${cfg.accessToken}`, file_offset: "0" },
    body: new Blob([bytes]),
  });
  const up = (await upRes.json().catch(() => ({}))) as { h?: string; error?: { message?: string } };
  if (!upRes.ok || !up.h) {
    throw new WhatsAppError(up.error?.message ?? `media upload failed (${upRes.status})`, upRes.status, false);
  }
  return up.h;
}

/** Fetch a public media URL and upload it to Meta; returns a media handle.
 *  Used for carousel card samples (the user gives a URL, we need a handle). */
export async function uploadTemplateMediaFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new WhatsAppError(`could not fetch media at ${url} (${res.status})`, 400, false);
  const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!;
  const bytes = await res.arrayBuffer();
  const name = url.split("/").pop()?.split("?")[0] || "media";
  return uploadTemplateMedia(bytes, name, mime);
}

/** Submit a template to Meta for approval. Returns the new template id + status. */
export async function createTemplate(input: CreateTemplateInput): Promise<{ id?: string; status?: string }> {
  const cfg = await getWaConfig();
  const res = await fetch(`https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.businessAccountId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: buildTemplateComponents(input),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new WhatsAppError(json.error?.message ?? `template create failed (${res.status})`, res.status, false);
  }
  return { id: json.id, status: json.status };
}
