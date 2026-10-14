// Pure helpers for previewing a template message — no DB/queue imports.

/**
 * Substitute {{n}} placeholders with the values entered on the broadcast form.
 * Missing/blank values keep the {{n}} placeholder so the operator can see
 * what's still unfilled.
 */
export function substituteTemplateVars(body: string, values: readonly (string | null | undefined)[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (raw, n: string) => {
    const v = values[Number(n) - 1]?.trim();
    return v ? v : raw;
  });
}

/**
 * Turn a broadcast-form variable entry into its preview display: a literal
 * shows as-is; a `field:xyz` mapping shows as a ⟨xyz⟩ token (the real value
 * differs per contact); blank stays blank (keeps the placeholder).
 */
export function previewVarValue(entry: string): string {
  const v = entry.trim();
  if (!v) return "";
  return v.startsWith("field:") ? `⟨${v.slice(6).trim() || "field"}⟩` : v;
}

/** Shape the preview component renders. Deliberately framework-free. */
export interface PreviewButton { type: string; text: string }
export interface PreviewCard { format: string; body?: string; buttonText?: string; mediaLabel: string }
export interface PreviewModel {
  headerFormat: string | null;
  headerLabel: string | null;
  ltoText: string | null;
  body: string;
  footer: string | null;
  buttons: PreviewButton[];
  cards: PreviewCard[] | null;
}

/** What the create-template form holds while the operator is filling it in. */
export interface TemplateDraft {
  body: string;
  examples: readonly string[];
  footer: string;
  headerFormat: string;
  headerFile: string;
  buttons: readonly { type: string; text: string; url: string; phoneNumber: string; couponExample: string }[];
  carouselOn: boolean;
  cards: readonly { format: string; mediaUrl: string; body: string; buttonText: string; buttonUrl: string }[];
  ltoOn: boolean;
  ltoText: string;
}

/**
 * Build the preview for a template that has NOT been submitted yet.
 *
 * Variables are filled with the operator's own example values, because those
 * are exactly what Meta's reviewer sees — previewing with anything else would
 * show a message that never gets reviewed. Unfilled variables keep their
 * {{n}} placeholder rather than collapsing, so a forgotten example is visible
 * rather than silently rendering as a gap.
 *
 * Mirrors the submit payload's layout rules: carousel replaces the top-level
 * header and buttons, and a limited-time offer has no footer.
 */
export function buildTemplatePreview(d: TemplateDraft): PreviewModel {
  const carousel = d.carouselOn;
  const buttons: PreviewButton[] = carousel
    ? []
    : d.buttons.map((b) => ({
        type: b.type,
        // A copy-code button renders the sample coupon, not a label — that is
        // what the recipient taps to copy.
        text:
          b.type === "COPY_CODE"
            ? b.couponExample.trim() || "Copy code"
            : b.text.trim() || buttonPlaceholder(b.type),
      }));

  return {
    headerFormat: carousel || !d.headerFormat ? null : d.headerFormat,
    headerLabel:
      carousel || !d.headerFormat
        ? null
        : d.headerFile.trim() || `${d.headerFormat.toLowerCase()} header — attach a sample above`,
    ltoText: d.ltoOn ? d.ltoText.trim() || "Expiring offer!" : null,
    body: substituteTemplateVars(d.body, d.examples),
    footer: carousel || d.ltoOn ? null : d.footer.trim() || null,
    buttons,
    cards: carousel
      ? d.cards.map((c) => ({
          format: c.format,
          body: c.body.trim() || undefined,
          buttonText: c.buttonText.trim() || undefined,
          mediaLabel: c.mediaUrl.trim() ? lastPathSegment(c.mediaUrl) : "no media yet",
        }))
      : null,
  };
}

function buttonPlaceholder(type: string): string {
  return type === "URL" ? "Link" : type === "PHONE_NUMBER" ? "Call" : "Button";
}

/** Filename-ish tail of a URL, for a compact media label. */
function lastPathSegment(url: string): string {
  const tail = url.trim().split("/").pop()?.split("?")[0];
  return tail || "media";
}
