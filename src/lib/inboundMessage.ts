// Pure normalization of an inbound WhatsApp message → our stored shape.
// No DB/framework imports, so it's unit-testable in isolation.

export interface InboundMessage {
  from: string;
  id?: string;
  type: string;
  text?: { body: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  reaction?: { emoji?: string; message_id?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  button?: { text?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
}

export interface NormalizedMessage {
  type: string; // text|image|document|audio|video|sticker|reaction|interactive|location
  text: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  mediaFilename: string | null;
}

const TYPE_PREVIEW: Record<string, string> = {
  image: "📷 Photo", document: "📄 Document", audio: "🎙️ Voice message",
  video: "🎬 Video", sticker: "🌟 Sticker", location: "📍 Location", reaction: "Reaction",
};

export function normalizeInbound(m: InboundMessage): NormalizedMessage {
  const base = { mediaId: null, mediaMime: null, mediaFilename: null } as const;
  if (m.text?.body) return { type: "text", text: m.text.body, ...base };
  if (m.image) return { type: "image", text: m.image.caption ?? null, mediaId: m.image.id ?? null, mediaMime: m.image.mime_type ?? null, mediaFilename: null };
  if (m.document) return { type: "document", text: m.document.caption ?? null, mediaId: m.document.id ?? null, mediaMime: m.document.mime_type ?? null, mediaFilename: m.document.filename ?? null };
  if (m.audio) return { type: "audio", text: null, mediaId: m.audio.id ?? null, mediaMime: m.audio.mime_type ?? null, mediaFilename: null };
  if (m.video) return { type: "video", text: m.video.caption ?? null, mediaId: m.video.id ?? null, mediaMime: m.video.mime_type ?? null, mediaFilename: null };
  if (m.sticker) return { type: "sticker", text: null, mediaId: m.sticker.id ?? null, mediaMime: m.sticker.mime_type ?? null, mediaFilename: null };
  if (m.reaction) return { type: "reaction", text: m.reaction.emoji ?? null, ...base };
  if (m.interactive) return { type: "interactive", text: m.interactive.button_reply?.title ?? m.interactive.list_reply?.title ?? null, ...base };
  if (m.button) return { type: "interactive", text: m.button.text ?? null, ...base };
  if (m.location) return { type: "location", text: m.location.name ?? m.location.address ?? null, ...base };
  return { type: m.type || "text", text: null, ...base };
}

/** Short thread preview for a conversation list. */
export function previewFor(n: NormalizedMessage): string {
  return (n.text && n.text.trim()) || TYPE_PREVIEW[n.type] || "New message";
}
