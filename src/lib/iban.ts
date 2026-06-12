// Lightweight IBAN validation (no external deps)
// - Normalizes (uppercase, strip spaces)
// - Length check per country
// - mod-97 == 1 check

const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
  LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27,
  MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24,
  RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export function normalizeIban(input: string): string {
  return (input || '').replace(/\s+/g, '').toUpperCase();
}

export function formatIban(input: string): string {
  return normalizeIban(input).replace(/(.{4})/g, '$1 ').trim();
}

export type IbanValidation =
  | { valid: true; normalized: string; country: string }
  | { valid: false; reason: 'empty' | 'format' | 'country' | 'length' | 'checksum'; country?: string };

export function validateIban(input: string): IbanValidation {
  const v = normalizeIban(input);
  if (!v) return { valid: false, reason: 'empty' };
  if (!/^[A-Z0-9]+$/.test(v)) return { valid: false, reason: 'format' };
  if (v.length < 15 || v.length > 34) return { valid: false, reason: 'length' };
  const country = v.slice(0, 2);
  const expectedLen = IBAN_LENGTHS[country];
  if (!expectedLen) return { valid: false, reason: 'country', country };
  if (v.length !== expectedLen) return { valid: false, reason: 'length', country };

  // mod-97
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const n = code >= 65 && code <= 90 ? (code - 55).toString() : ch; // A=10..Z=35
    for (const d of n) {
      remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
  }
  if (remainder !== 1) return { valid: false, reason: 'checksum', country };
  return { valid: true, normalized: v, country };
}

// BIC/SWIFT: 8 or 11 chars, basic structural check
export function validateBic(input: string): boolean {
  if (!input) return true; // BIC is optional in our flow
  const v = input.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v);
}
