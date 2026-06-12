// Layer 39 — Psychological State Engine (canon)
//
// Detects mental state of leads from inbound messages and adapts response
// tone + structure. Integrated into Layer 38 Conversational AI Responder.
//
// Hard rules:
//   • 5 states only — uncertain | busy | rational | dominant | neutral
//   • State change requires 2 consecutive signals (smoothing) before
//     dominant_state flips. Single-message detected_state still adapts reply.
//   • L6 override always wins (state_override).
//   • Engine can be disabled per conversation via psych_engine_disabled=true.
//   • Per-state templates are PREFERRED; fall back to intent-base templates.
//   • Never block a reply due to missing state template — fall back gracefully.
//
// Canon-Map: C9 (Conversion). Block: Conversion (primary) + Intelligence + Foundation.

export const PSYCH_STATES = [
  "uncertain",
  "busy",
  "rational",
  "dominant",
  "neutral",
] as const;

export type PsychState = (typeof PSYCH_STATES)[number];

export const PSYCH_STATE_META: Record<
  PsychState,
  { label_de: string; label_en: string; tone: string; structure: string }
> = {
  uncertain: {
    label_de: "Unsicher",
    label_en: "Uncertain",
    tone: "calm · reassuring · simple",
    structure: "reduce complexity · lower pressure · safe next step",
  },
  busy: {
    label_de: "Beschäftigt",
    label_en: "Busy",
    tone: "efficient · minimal",
    structure: "short · one question · fast decision",
  },
  rational: {
    label_de: "Rational",
    label_en: "Rational",
    tone: "structured · logical",
    structure: "clear reasoning · outcome-based · no fluff",
  },
  dominant: {
    label_de: "Direkt",
    label_en: "Direct",
    tone: "direct · confident",
    structure: "no softening · fast control transfer · clear CTA",
  },
  neutral: {
    label_de: "Neutral",
    label_en: "Neutral",
    tone: "balanced · default",
    structure: "standard intent flow",
  },
};

/**
 * State-adapted template_key resolver.
 * Tries state-specific first (e.g. `wa_state_uncertain_objection`), falls back
 * to the base intent template_key passed in.
 */
export function pickStateTemplateKey(
  baseTemplateKey: string,
  state: PsychState,
): { primary: string; fallback: string } {
  if (state === "neutral" || !baseTemplateKey) {
    return { primary: baseTemplateKey, fallback: baseTemplateKey };
  }
  // Convention: wa_state_<state>_<purpose>
  // We map base template_keys → purpose suffix.
  const purposeMap: Record<string, string> = {
    wa_hesitation_soft: "hesitation",
    wa_objection_handle: "objection",
    wa_question_brief: "question",
    wa_booking_confirm: "booking",
    wa_first_touch: "first_touch",
    wa_neutral_reply: "open",
  };
  // Objection deep scripts (wa_obj_*) → keep their specificity, just prepend state attempt
  const purpose = purposeMap[baseTemplateKey] ?? null;
  if (!purpose) {
    return { primary: baseTemplateKey, fallback: baseTemplateKey };
  }
  return {
    primary: `wa_state_${state}_${purpose}`,
    fallback: baseTemplateKey,
  };
}

/**
 * Smoothing: only flip dominant_state if the last N detections agree.
 * Returns the new dominant state (may be unchanged).
 */
export function applySmoothing(
  history: Array<{ state: PsychState; ts: string }>,
  newDetection: PsychState,
  currentDominant: PsychState | null,
  requireConsecutive = 2,
): { dominant: PsychState; flipped: boolean; smoothed: boolean } {
  // Window: last (requireConsecutive - 1) historical + current new = requireConsecutive
  const recent = history.slice(-(requireConsecutive - 1)).map((h) => h.state);
  recent.push(newDetection);

  const allAgree =
    recent.length >= requireConsecutive &&
    recent.every((s) => s === newDetection);

  if (currentDominant === null) {
    // First-ever: set immediately
    return { dominant: newDetection, flipped: true, smoothed: false };
  }
  if (newDetection === currentDominant) {
    return { dominant: currentDominant, flipped: false, smoothed: false };
  }
  if (allAgree) {
    return { dominant: newDetection, flipped: true, smoothed: false };
  }
  // Detected something different but not enough confirmation → keep dominant, smoothed
  return { dominant: currentDominant, flipped: false, smoothed: true };
}

/** Trim history to last N entries (storage hygiene). */
export function trimHistory<T>(arr: T[], max = 10): T[] {
  return arr.length <= max ? arr : arr.slice(-max);
}
