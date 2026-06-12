/**
 * Phone validation & normalization for lead quality gating.
 *
 * Rules:
 * - Phone is REQUIRED for lead creation.
 * - Fake / placeholder patterns are rejected.
 * - Best-effort E.164 normalization for DACH region.
 */

export interface PhoneValidationResult {
  phone_raw: string;
  phone_normalized: string;
  phone_valid: boolean;
  phone_quality_status: "valid" | "invalid" | "fake" | "missing";
  phone_quality_reason: string;
}

const FAKE_PATTERNS = [
  /^0{5,}$/,
  /^1{5,}$/,
  /^2{5,}$/,
  /^3{5,}$/,
  /^4{5,}$/,
  /^5{5,}$/,
  /^6{5,}$/,
  /^7{5,}$/,
  /^8{5,}$/,
  /^9{5,}$/,
  /^123456/,
  /^654321/,
  /^000000/,
  /^111111/,
  /^999999/,
];

/** Strip everything except digits and leading + */
function stripPhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "");
}

/** Best-effort E.164 normalization (DACH focus). */
function normalizeToE164(digits: string): string {
  // Already has country code
  if (digits.startsWith("+")) return digits;

  // German format: 0170... → +49170...
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 15) {
    return "+49" + digits.slice(1);
  }

  // Austrian: starts with 0 but shorter — same logic
  // Swiss: same logic
  // If no leading 0, assume it has a country code already
  if (digits.length >= 10 && digits.length <= 15) {
    // Could be missing +, try adding it
    if (digits.startsWith("49") || digits.startsWith("43") || digits.startsWith("41")) {
      return "+" + digits;
    }
    // Unknown country code — just prefix +
    return "+" + digits;
  }

  return digits;
}

function isRepeatedDigit(digits: string): boolean {
  if (digits.length < 5) return false;
  const d = digits.replace(/\D/g, "");
  return d.length >= 5 && new Set(d.split("")).size === 1;
}

export function validatePhone(raw: string): PhoneValidationResult {
  const phone_raw = raw.trim();

  if (!phone_raw) {
    return {
      phone_raw,
      phone_normalized: "",
      phone_valid: false,
      phone_quality_status: "missing",
      phone_quality_reason: "Keine Telefonnummer angegeben.",
    };
  }

  const stripped = stripPhone(phone_raw);
  const digitsOnly = stripped.replace(/\D/g, "");

  // Too short (less than 7 digits)
  if (digitsOnly.length < 7) {
    return {
      phone_raw,
      phone_normalized: stripped,
      phone_valid: false,
      phone_quality_status: "invalid",
      phone_quality_reason: "Nummer zu kurz.",
    };
  }

  // Too long (more than 15 digits per E.164)
  if (digitsOnly.length > 15) {
    return {
      phone_raw,
      phone_normalized: stripped,
      phone_valid: false,
      phone_quality_status: "invalid",
      phone_quality_reason: "Nummer zu lang.",
    };
  }

  // Repeated digits
  if (isRepeatedDigit(digitsOnly)) {
    return {
      phone_raw,
      phone_normalized: stripped,
      phone_valid: false,
      phone_quality_status: "fake",
      phone_quality_reason: "Wiederholte Ziffern erkannt.",
    };
  }

  // Known fake patterns
  for (const pattern of FAKE_PATTERNS) {
    if (pattern.test(digitsOnly)) {
      return {
        phone_raw,
        phone_normalized: stripped,
        phone_valid: false,
        phone_quality_status: "fake",
        phone_quality_reason: "Bekanntes Fake-Muster erkannt.",
      };
    }
  }

  const normalized = normalizeToE164(stripped);

  return {
    phone_raw,
    phone_normalized: normalized,
    phone_valid: true,
    phone_quality_status: "valid",
    phone_quality_reason: "Telefonnummer validiert.",
  };
}

/** Human-facing validation error for form display */
export function getPhoneError(raw: string): string | null {
  if (!raw.trim()) return "Telefonnummer ist erforderlich.";
  const result = validatePhone(raw);
  if (result.phone_valid) return null;
  return result.phone_quality_reason;
}
