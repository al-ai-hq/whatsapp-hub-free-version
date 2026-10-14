/**
 * BullMQ custom job ids.
 *
 * BullMQ uses ":" as its Redis key delimiter and rejects it in custom job ids
 * ("Custom Id cannot contain :"). It also rejects ids that parse as integers.
 * Build ids here so every enqueue site stays legal.
 */
export function sendJobId(...parts: (string | number)[]): string {
  return parts.map((p) => String(p).replace(/:/g, "-")).join("_");
}
