import crypto from "node:crypto";

/**
 * Verify Meta's X-Hub-Signature-256 header: sha256=HMAC-SHA256(appSecret, rawBody).
 * Pure + constant-time. Returns false on any missing/oversized/mismatched input
 * rather than throwing, so callers can treat false as "reject".
 */
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null | undefined,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  // Length check first so timingSafeEqual never throws on mismatched buffers.
  if (signatureHeader.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
