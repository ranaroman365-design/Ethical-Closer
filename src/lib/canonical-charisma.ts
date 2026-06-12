/**
 * ============================================================================
 * LAYER 15 — CHARISMA LAYER (ETC)
 * ============================================================================
 *
 * Controlled-intensity overlay on top of Layer 14 (Emotion) and Layer 13
 * (Narrative). Upgrades all communication to Seductive · Magnetic · Charismatic
 * without breaking the Canon, adding hype, or making fast-money claims.
 *
 * CORE PRINCIPLE:  Tension → Clarity → Authority → Identity
 *
 * HARD RULES:
 *   ❌ Do NOT change the Canonical Narrative (Layer 13).
 *   ❌ Do NOT add fluff, exaggeration, or "make money fast" claims.
 *   ❌ Do NOT introduce aggressive / pushy phrasing.
 *   ✅ Only increase emotional tension, sharpen phrasing, elevate identity,
 *      compress language.
 *
 * Source of truth. Do NOT inline copies. Import from here.
 * ============================================================================
 */

import type { NarrativeLang } from "./canonical-narrative";

// ----------------------------------------------------------------------------
// 1. SEDUCTION PATTERNS — controlled tension + truth (no exaggeration).
// ----------------------------------------------------------------------------
export type SeductionPattern = "hidden_truth" | "reality_check" | "inevitable_insight";

export const SEDUCTION_PATTERNS: Readonly<
  Record<
    SeductionPattern,
    { label: string; line: { en: string; de: string } }
  >
> = Object.freeze({
  hidden_truth: {
    label: "Hidden Truth",
    line: {
      en: "Most people think talent decides who wins. That's exactly why they stay stuck.",
      de: "Die meisten glauben, Talent entscheidet. Genau deshalb bleiben sie stecken.",
    },
  },
  reality_check: {
    label: "Reality Check",
    line: {
      en: "You don't have a sales problem. You have a structure problem.",
      de: "Du hast kein Sales-Problem. Du hast ein Struktur-Problem.",
    },
  },
  inevitable_insight: {
    label: "Inevitable Insight",
    line: {
      en: "Without a system, performance is random.",
      de: "Ohne System ist Leistung Zufall.",
    },
  },
});

// ----------------------------------------------------------------------------
// 2. MAGNETISM — clarity + certainty. Word-level upgrades.
// ----------------------------------------------------------------------------
export const MAGNETISM_REPLACEMENTS = Object.freeze({
  en: [
    { weak: /\byou could\b/gi, strong: "you will" },
    { weak: /\bthis helps\b/gi, strong: "this gives you" },
    { weak: /\bwe try to\b/gi, strong: "we do" },
    { weak: /\bcan help\b/gi, strong: "delivers" },
    { weak: /\bmight\b/gi, strong: "will" },
  ],
  de: [
    { weak: /\bdu könntest\b/gi, strong: "du wirst" },
    { weak: /\bdas hilft\b/gi, strong: "das gibt dir" },
    { weak: /\bwir versuchen\b/gi, strong: "wir liefern" },
    { weak: /\bvielleicht\b/gi, strong: "" },
  ],
} as const);

// ----------------------------------------------------------------------------
// 3. CHARISMA — identity shifts (calm, certain, non-needy authority).
// ----------------------------------------------------------------------------
export type IdentityShift = "learn_to_trusted" | "close_to_operate" | "perform_to_lead";

export const IDENTITY_SHIFTS: Readonly<
  Record<IdentityShift, { from: { en: string; de: string }; to: { en: string; de: string } }>
> = Object.freeze({
  learn_to_trusted: {
    from: { en: "Not just learning sales", de: "Nicht nur Sales lernen" },
    to: {
      en: "becoming someone companies trust",
      de: "jemand werden, dem Unternehmen vertrauen",
    },
  },
  close_to_operate: {
    from: { en: "Not just closing deals", de: "Nicht nur Deals abschließen" },
    to: { en: "operating revenue", de: "Umsatz operieren" },
  },
  perform_to_lead: {
    from: { en: "Not just performing", de: "Nicht nur performen" },
    to: {
      en: "leading a sales operation with clarity",
      de: "eine Sales-Operation mit Klarheit führen",
    },
  },
});

// ----------------------------------------------------------------------------
// 4. CHARISMA HOOK — final 4-beat structure: Tension → Truth → Shift → System.
// ----------------------------------------------------------------------------
export type CharismaHookBeat = "tension" | "truth" | "shift" | "system";

export const CHARISMA_HOOK: readonly CharismaHookBeat[] = Object.freeze([
  "tension",
  "truth",
  "shift",
  "system",
]);

export const CHARISMA_HOOK_TEMPLATE = Object.freeze({
  en: {
    tension: "Most people try to learn sales and never make real money.",
    truth: "There is no structure. No path.",
    shift: "That's why performance stays random.",
    system: "This system changes that.",
  },
  de: {
    tension: "Die meisten versuchen, Sales zu lernen — und verdienen nie wirklich Geld.",
    truth: "Es gibt keine Struktur. Keinen Weg.",
    shift: "Deshalb bleibt Leistung Zufall.",
    system: "Dieses System ändert das.",
  },
} as const);

// ----------------------------------------------------------------------------
// 5. END-STATE (CHARISMA UPGRADE) — locked final form.
//    Layer 13 keeps its three variants intact; this is the Charisma rendering.
// ----------------------------------------------------------------------------
export const END_STATE_CHARISMA = Object.freeze({
  en: "The end goal is to become a Senior Closer who not only closes deals at a high level, but understands the full system, operates it effectively, and can guide a team with clarity and consistency.\nSomeone companies trust to build, run, and scale revenue.\nAn Ethical Top Closer.",
  de: "Das Ziel ist es, ein Senior Closer zu werden, der nicht nur auf höchstem Niveau abschließt, sondern das gesamte System versteht, es effektiv betreibt und ein Team mit Klarheit und Konsistenz führen kann.\nJemand, dem Unternehmen vertrauen, Umsatz aufzubauen, zu führen und zu skalieren.\nEin Ethical Top Closer.",
} as const);

// ----------------------------------------------------------------------------
// 6. MICRO-STYLE RULES — banned hedging / softening words.
// ----------------------------------------------------------------------------
export const BANNED_WORDS: Readonly<Record<NarrativeLang, readonly string[]>> =
  Object.freeze({
    en: ["maybe", "kind of", "basically", "we try", "you can", "perhaps", "sort of"],
    de: ["vielleicht", "irgendwie", "im Grunde", "wir versuchen", "eventuell"],
  });

// ----------------------------------------------------------------------------
// 7. HARD RULES — machine-readable governance.
// ----------------------------------------------------------------------------
export const CHARISMA_RULES = Object.freeze({
  doNotModifyNarrative: true,
  doNotAddHype: true,
  doNotPromiseFastMoney: true,
  toneMustBe: ["calm", "certain", "non-needy"] as const,
  hookBeats: CHARISMA_HOOK,
  allowedSeductionPatterns: Object.keys(SEDUCTION_PATTERNS) as SeductionPattern[],
  allowedIdentityShifts: Object.keys(IDENTITY_SHIFTS) as IdentityShift[],
} as const);

// ----------------------------------------------------------------------------
// 8. HELPERS
// ----------------------------------------------------------------------------
export function getSeduction(p: SeductionPattern, lang: NarrativeLang = "en"): string {
  return SEDUCTION_PATTERNS[p].line[lang];
}

export function getIdentityShift(s: IdentityShift, lang: NarrativeLang = "en"): string {
  const sh = IDENTITY_SHIFTS[s];
  return `${sh.from[lang]} → ${sh.to[lang]}.`;
}

export function getCharismaHook(lang: NarrativeLang = "en"): string {
  const t = CHARISMA_HOOK_TEMPLATE[lang];
  return `${t.tension}\n${t.truth}\n${t.shift}\n${t.system}`;
}

export function getEndStateCharisma(lang: NarrativeLang = "en"): string {
  return END_STATE_CHARISMA[lang];
}

/** Apply magnetism replacements (weak → strong) to copy. */
export function applyMagnetism(text: string, lang: NarrativeLang = "en"): string {
  return MAGNETISM_REPLACEMENTS[lang].reduce(
    (acc, { weak, strong }) => acc.replace(weak, strong).replace(/ {2,}/g, " ").trim(),
    text,
  );
}

// ----------------------------------------------------------------------------
// 9. VALIDATION — banned-word + hype-claim check.
// ----------------------------------------------------------------------------
const HYPE_PATTERNS = [
  /\bget rich\b/i,
  /\bovernight\b/i,
  /\bguaranteed (income|results?|money)\b/i,
  /\bpassive income\b/i,
  /\bquit your job\b/i,
  /\bmake \$?\d+k? in \d+ (days?|weeks?|months?)\b/i,
];

export type CharismaCheck = {
  passed: boolean;
  failures: string[];
  warnings: string[];
};

/**
 * Validate copy against the Charisma rules.
 *   - No banned hedging words
 *   - No hype / fast-money claims
 *   - Returns warnings only (does not enforce structure — Layer 14 does that)
 */
export function validateCharisma(
  text: string,
  lang: NarrativeLang = "en",
): CharismaCheck {
  const failures: string[] = [];
  const warnings: string[] = [];
  const lower = text.toLowerCase();

  for (const w of BANNED_WORDS[lang]) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) {
      warnings.push(`Banned hedging word: "${w}". Replace with a direct statement.`);
    }
  }
  for (const p of HYPE_PATTERNS) {
    if (p.test(text)) {
      failures.push(`Hype/fast-money claim detected (matches ${p}). Remove.`);
    }
  }

  return { passed: failures.length === 0, failures, warnings };
}

/** Dev-mode guard. Throws when copy violates Charisma rules. */
export function assertCharismaSafe(text: string, lang: NarrativeLang = "en"): void {
  if (import.meta.env?.PROD) return;
  const result = validateCharisma(text, lang);
  if (!result.passed) {
    throw new Error(
      `[CharismaLayer] Copy violates Charisma rules:\n  - ${result.failures.join("\n  - ")}`,
    );
  }
}
