import { z } from "zod";

// E.164 without leading '+', 8–15 digits (covers KSA/Kuwait/Qatar/Jordan, etc.)
export const PhoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[^\d]/g, "")) // strip +, spaces, dashes
  .pipe(z.string().regex(/^\d{8,15}$/, "Phone must be 8–15 digits in E.164"));

// A template "Call" button carries a number Meta dials from anywhere, so it has to
// be a full international one. Meta rejects a national number — a leading 0, or no
// country code — with error #192, but only after the template has round-tripped
// through review, which makes the mistake an expensive one to leave uncaught.
// Normalise what people actually type (spaces, dashes, brackets, a 00 international
// prefix) and require what is left to be E.164: '+', a country code, 7–15 digits in
// total. Country codes never begin with 0, which is what makes the common
// "+962 079…" slip catchable here rather than at Meta.
export const TemplatePhoneSchema = z
  .string()
  .trim()
  .transform((s) => {
    const cleaned = s.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  })
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{6,14}$/,
        "Use the full international number with country code, e.g. +962798960079 (drop the leading 0)",
      ),
  );

export const ContactRowSchema = z.object({
  phone: PhoneSchema,
  name: z.string().trim().max(120).optional(),
  // any extra CSV columns become template variables
  attributes: z.record(z.string()).default({}),
});
export type ContactRow = z.infer<typeof ContactRowSchema>;

/** Build a single display name from first/last parts. Returns undefined if both are blank. */
export function composeName(first?: string | null, last?: string | null): string | undefined {
  const name = [first, last].map((p) => p?.trim()).filter(Boolean).join(" ");
  return name.length > 0 ? name : undefined;
}

// Add a single contact via the UI. The phone is expected as E.164 digits (the
// form composes country code + national number); PhoneSchema re-validates it.
// A set of list ids. Duplicates are collapsed so the caller can send whatever the
// checkboxes produced; the empty array is meaningful and means "no lists".
export const ListIdsSchema = z
  .array(z.string().min(1))
  .max(200)
  .transform((ids) => [...new Set(ids)]);

export const CreateContactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().max(60).optional(),
  phone: PhoneSchema,
  // `listId` predates multi-list membership and is still what the CSV importer
  // sends; `listIds` is the form's. Both are honoured and merged.
  listId: z.string().min(1).optional(),
  listIds: ListIdsSchema.optional(),
  // extra key/value template variables
  attributes: z.record(z.string()).default({}),
});
export type CreateContactInput = z.infer<typeof CreateContactSchema>;

// Add many contacts to one list in a single request.
export const BulkAddToListSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one contact").max(500),
  listId: z.string().min(1, "Choose a list"),
});

/**
 * Work out the membership changes for a contact, given the lists it is in now
 * and the ones the operator ticked.
 *
 * `selectable` is the set of lists the picker actually offered — non-archived
 * lists. Anything outside it is left strictly alone, so saving the form can
 * never quietly drop a contact out of an archived list it still belongs to.
 */
export function diffListMembership(
  current: readonly string[],
  desired: readonly string[],
  selectable: readonly string[],
): { add: string[]; remove: string[] } {
  const offered = new Set(selectable);
  const want = new Set(desired.filter((id) => offered.has(id)));
  const have = new Set(current);

  return {
    add: [...want].filter((id) => !have.has(id)),
    remove: [...have].filter((id) => offered.has(id) && !want.has(id)),
  };
}

export const CreateBroadcastSchema = z.object({
  templateId: z.string().min(1),
  listId: z.string().min(1),
  // Map template {{1}},{{2}}... to a Contact field or literal.
  // e.g. [{ "from": "name" }, { "literal": "20% off" }]
  variableMap: z
    .array(
      z.union([
        z.object({ from: z.string().min(1) }),
        z.object({ literal: z.string() }),
      ]),
    )
    .default([]),
  // ISO 8601; null/absent = send now. Must be in the future if provided.
  scheduleAt: z
    .string()
    .datetime()
    .refine((s) => new Date(s).getTime() > Date.now(), "scheduleAt must be in the future")
    .optional(),
  // Media URL for the header — required when the chosen template has a media header.
  headerMediaUrl: z.string().url().optional(),
  // Coupon code — required when the chosen template has a COPY_CODE button.
  couponCode: z.string().trim().min(1).max(15).optional(),
  // Per-card media URL overrides for a carousel template, by card index.
  // "" keeps that card's default media from the template.
  cardMediaUrls: z.array(z.union([z.string().url(), z.literal("")])).max(10).optional(),
  // Offer expiry — required when the chosen template is a countdown limited-time offer.
  ltoExpiresAt: z
    .string()
    .datetime()
    .refine((s) => new Date(s).getTime() > Date.now(), "ltoExpiresAt must be in the future")
    .optional(),
});

// Public landing-page lead form. `website` is a honeypot — humans never see
// it; the route silently drops submissions that fill it.
export const LeadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: PhoneSchema,
  business: z.string().trim().max(120).optional(),
  website: z.string().max(200).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const CreateListSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// Create a WhatsApp template and submit it to Meta for approval.
export const CreateTemplateSchema = z
  .object({
    name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Use lowercase letters, numbers, and underscores only"),
    language: z.string().trim().min(2).max(12),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
    // Optional media header (attachment). PDF counts as DOCUMENT. The example is
    // a sample media URL/handle Meta uses while reviewing the template.
    header: z
      .object({
        format: z.enum(["IMAGE", "DOCUMENT", "VIDEO"]),
        example: z.string().trim().min(1, "Add a sample media URL for the header"),
      })
      .optional(),
    body: z.string().trim().min(1).max(1024),
    bodyExamples: z.array(z.string()).default([]),
    footer: z.string().trim().max(60).optional(),
    buttons: z
      .array(
        z.object({
          type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"]),
          text: z.string().trim().min(1).max(25),
          url: z.string().url().optional(),
          phoneNumber: TemplatePhoneSchema.optional(),
          couponExample: z.string().trim().min(1).max(15).optional(),
        }),
      )
      .max(3)
      .default([]),
    // Carousel: 2–10 cards, each a media URL + static body + optional URL button.
    carousel: z
      .object({
        cards: z
          .array(
            z.object({
              format: z.enum(["IMAGE", "VIDEO"]),
              mediaUrl: z.string().url(),
              body: z.string().trim().min(1).max(160),
              buttonText: z.string().trim().max(25).optional(),
              buttonUrl: z.string().url().optional(),
            }),
          )
          .min(2, "A carousel needs at least 2 cards")
          .max(10),
      })
      .optional(),
    // Limited-time offer: a banner above the body (≤16 chars, no variables/emoji)
    // with an optional countdown timer.
    limitedTimeOffer: z
      .object({
        text: z.string().trim().min(1, "Add the offer text").max(16, "Offer text is 16 characters max"),
        hasExpiration: z.boolean().default(false),
      })
      .optional(),
  })
  .refine((t) => t.buttons.every((b) => b.type !== "URL" || !!b.url), {
    message: "URL buttons need a URL",
    path: ["buttons"],
  })
  .refine((t) => t.buttons.every((b) => b.type !== "PHONE_NUMBER" || !!b.phoneNumber), {
    message: "Call buttons need a phone number",
    path: ["buttons"],
  })
  .refine((t) => t.buttons.every((b) => b.type !== "COPY_CODE" || !!b.couponExample), {
    message: "Copy-code buttons need a sample coupon code",
    path: ["buttons"],
  })
  .refine(
    (t) => {
      const vars = (t.body.match(/\{\{\d+\}\}/g) ?? []).length;
      return t.bodyExamples.filter((e) => e.trim()).length >= vars;
    },
    { message: "Provide an example value for each {{variable}}", path: ["bodyExamples"] },
  )
  // Limited-time offer constraints (Meta): URL button required; only copy-code +
  // URL buttons; no footer; header must be image/video; not combinable with carousel.
  .refine((t) => !t.limitedTimeOffer || t.buttons.some((b) => b.type === "URL"), {
    message: "Limited-time offers need a URL button",
    path: ["buttons"],
  })
  .refine((t) => !t.limitedTimeOffer || t.buttons.every((b) => b.type === "URL" || b.type === "COPY_CODE"), {
    message: "Limited-time offers only allow copy-code and URL buttons",
    path: ["buttons"],
  })
  .refine((t) => !t.limitedTimeOffer || !t.footer, {
    message: "Limited-time offers don't support a footer",
    path: ["footer"],
  })
  .refine((t) => !t.limitedTimeOffer || !t.header || t.header.format !== "DOCUMENT", {
    message: "Limited-time offers only support image or video headers",
    path: ["header"],
  })
  .refine((t) => !(t.limitedTimeOffer && t.carousel), {
    message: "A template can't be both a carousel and a limited-time offer",
    path: ["limitedTimeOffer"],
  });

// 5-field cron (min hour dom month dow). Loose validation — BullMQ parses fully.
const CRON_RE = /^(\S+\s+){4}\S+$/;
export const CreateRecurringSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateId: z.string().min(1),
  listId: z.string().min(1),
  cron: z.string().trim().regex(CRON_RE, "cron must have 5 fields, e.g. 0 9 * * 1"),
  variableMap: z
    .array(z.union([z.object({ from: z.string().min(1) }), z.object({ literal: z.string() })]))
    .default([]),
});
export type CreateBroadcastInput = z.infer<typeof CreateBroadcastSchema>;

export const SendMessageSchema = z.object({
  text: z.string().trim().min(1, "Message can't be empty").max(4096),
});

// Send an approved template into a single conversation (re-opens a closed
// 24h window). Variables are literal values — there's exactly one recipient.
export const SendTemplateMessageSchema = z.object({
  templateId: z.string().min(1),
  variables: z.array(z.string().trim().max(1024)).max(20).default([]),
});

// Inbound webhook payload — only the fields we consume, validated defensively.
export const WebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string().optional(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            // Template approval/rejection updates (field: message_template_status_update)
            event: z.string().optional(),
            message_template_name: z.string().optional(),
            message_template_language: z.string().optional(),
            reason: z.string().nullish(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.enum(["sent", "delivered", "read", "failed"]),
                  recipient_id: z.string().optional(),
                  errors: z.array(z.object({ title: z.string() })).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  id: z.string().optional(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  context: z.object({ id: z.string() }).optional(),
                  button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
                  interactive: z
                    .object({
                      type: z.string().optional(),
                      button_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
                      list_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
                    })
                    .optional(),
                  image: z.object({ id: z.string().optional(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
                  document: z.object({ id: z.string().optional(), mime_type: z.string().optional(), filename: z.string().optional(), caption: z.string().optional() }).optional(),
                  audio: z.object({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
                  video: z.object({ id: z.string().optional(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
                  sticker: z.object({ id: z.string().optional(), mime_type: z.string().optional() }).optional(),
                  reaction: z.object({ emoji: z.string().optional(), message_id: z.string().optional() }).optional(),
                  location: z.object({ latitude: z.number().optional(), longitude: z.number().optional(), name: z.string().optional(), address: z.string().optional() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});
export type WebhookPayload = z.infer<typeof WebhookSchema>;
