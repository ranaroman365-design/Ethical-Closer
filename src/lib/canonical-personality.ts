// Layer 40 — Personality Matching Engine (canon)
//
// Detects the lead's underlying personality TYPE (vs Layer 39 momentary STATE)
// and adapts WhatsApp tone/structure/CTA accordingly. Combines with L39:
// final response = personality (who they ARE) × state (how they feel NOW).
//
// Hard rules:
//   • 5 types only — dominant | analytical | relational | expressive | unknown
//   • Smoothing: dominant_personality flips only when 2 consecutive detections agree
//   • L6 override always wins (personality_override)
//   • Engine can be disabled per conversation via personality_engine_disabled=true
//   • Template resolution priority:
//       1. wa_p_<personality>_<purpose>          (L40 personality)
//       2. wa_state_<state>_<purpose>            (L39 state)
//       3. base intent template (incl. wa_obj_*) (L38)
//       4. inline FALLBACK_COPY                  (safety)
//   • Never block a reply on missing personality template — graceful fallback.
//
// Canon-Map: C10 (Conversion). Block: Conversion (primary) + Intelligence + Foundation.

export const PERSONALITY_TYPES = [
  "dominant",
  "analytical",
  "relational",
  "expressive",
  "unknown",
] as const;

export type Personality = (typeof PERSONALITY_TYPES)[number];

export const PERSONALITY_META: Record<
  Personality,
  {
    label_de: string;
    label_en: string;
    color: string;     // tailwind chip class group
    tone: string;
    structure: string;
    cta_style: string;
  }
> = {
  dominant: {
    label_de: "Direkt",
    label_en: "Driver",
    color: "rose",
    tone: "short · direct · no fluff",
    structure: "1 line, decision-based",
    cta_style: "binary choice (yes/no, today/tomorrow)",
  },
  analytical: {
    label_de: "Analytisch",
    label_en: "Analytical",
    color: "sky",
    tone: "structured · logical · minimal emotion",
    structure: "3 numbered points + clear next step",
    cta_style: "structured slot with reason",
  },
  relational: {
    label_de: "Beziehungs-orientiert",
    label_en: "Relational",
    color: "emerald",
    tone: "warm · empathetic · slower",
    structure: "validation → safe next step",
    cta_style: "no pressure, soft choice",
  },
  expressive: {
    label_de: "Visionär",
    label_en: "Expressive",
    color: "amber",
    tone: "energetic · future-focused · possibility",
    structure: "vision hook → concrete next step",
    cta_style: "let's-go framing",
  },
  unknown: {
    label_de: "Unbekannt",
    label_en: "Unknown",
    color: "stone",
    tone: "balanced · neutral default",
    structure: "fall back to state/intent template",
    cta_style: "default booking CTA",
  },
};

/** Template purpose mapped from intent. Mirrors L39 mapping. */
export const INTENT_TO_PURPOSE: Record<string, string> = {
  hesitation: "hesitation",
  objection: "objection",
  question: "question",
  booking_intent: "booking",
};

/**
 * Build the personality template_key candidate.
 * Returns null when personality=unknown or no purpose mapping exists.
 */
export function pickPersonalityTemplateKey(
  personality: Personality,
  intent: string,
): string | null {
  if (personality === "unknown") return null;
  const purpose = INTENT_TO_PURPOSE[intent];
  if (!purpose) return null;
  return `wa_p_${personality}_${purpose}`;
}

/**
 * Smoothing: dominant_personality flips only when last (requireConsecutive)
 * detections (incl. new) all agree. Otherwise keep current dominant.
 */
export function applyPersonalitySmoothing(
  history: Array<{ personality: Personality; ts: string }>,
  newDetection: Personality,
  currentDominant: Personality | null,
  requireConsecutive = 2,
): { dominant: Personality; flipped: boolean; smoothed: boolean } {
  if (currentDominant === null || currentDominant === undefined) {
    return { dominant: newDetection, flipped: true, smoothed: false };
  }
  if (newDetection === currentDominant) {
    return { dominant: currentDominant, flipped: false, smoothed: false };
  }
  const recent = history
    .slice(-(requireConsecutive - 1))
    .map((h) => h.personality);
  recent.push(newDetection);
  const allAgree =
    recent.length >= requireConsecutive &&
    recent.every((p) => p === newDetection);
  if (allAgree) {
    return { dominant: newDetection, flipped: true, smoothed: false };
  }
  return { dominant: currentDominant, flipped: false, smoothed: true };
}

export function trimPersonalityHistory<T>(arr: T[], max = 10): T[] {
  return arr.length <= max ? arr : arr.slice(-max);
}
