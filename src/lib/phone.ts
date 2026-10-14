// Phone helpers shared by the UI and (potentially) the server.
//
// WhatsApp/Cloud API requires E.164 *without* the leading '+', e.g. 966500000001.
// The trickiest part for users is the country code, so this combines an explicit
// country calling code with a national number while tolerating the common ways
// people type numbers: spaces/dashes, a leading '+', a national trunk '0', or
// accidentally re-typing the country code into the national field.

/** Country calling codes offered in the add-contact form. Code = digits only. */
export const COUNTRY_CODES: { code: string; name: string; flag: string }[] = [
  { code: "966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "971", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "965", name: "Kuwait", flag: "🇰🇼" },
  { code: "974", name: "Qatar", flag: "🇶🇦" },
  { code: "973", name: "Bahrain", flag: "🇧🇭" },
  { code: "968", name: "Oman", flag: "🇴🇲" },
  { code: "962", name: "Jordan", flag: "🇯🇴" },
  { code: "961", name: "Lebanon", flag: "🇱🇧" },
  { code: "20", name: "Egypt", flag: "🇪🇬" },
  { code: "212", name: "Morocco", flag: "🇲🇦" },
  { code: "1", name: "USA / Canada", flag: "🇺🇸" },
  { code: "44", name: "United Kingdom", flag: "🇬🇧" },
];

/**
 * Combine a country calling code with a national number into E.164 digits
 * (no '+'). Returns digits only.
 *
 * Examples (countryCode "966"):
 *   "050 000 0001"        → "966500000001"  (drops trunk 0)
 *   "+966 50 000 0001"    → "966500000001"  (country code not doubled)
 *   "500000001"           → "966500000001"
 */
export function toE164(countryCode: string, national: string): string {
  const cc = countryCode.replace(/\D/g, "");
  let nat = national.replace(/\D/g, "");
  // If the user re-typed the country code in the national field, don't double it.
  if (cc && nat.startsWith(cc)) nat = nat.slice(cc.length);
  // Drop a national trunk prefix '0' (e.g. UK/EU/local formats).
  nat = nat.replace(/^0+/, "");
  return cc + nat;
}

/** Strip leading + and spaces, validate non-empty. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (!digits) throw new Error("Phone number is required");
  return digits;
}
