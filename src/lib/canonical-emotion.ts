/**
 * ============================================================================
 * LAYER 14 — EMOTIONAL & CONVERSION CANON (ETC)
 * ============================================================================
 *
 * Sits BEFORE the Canonical Narrative (Layer 13) on every conversion surface.
 * Activates desire, tension, urgency — without changing the Canon.
 *
 * CORE PRINCIPLE:  Emotion → Narrative → Proof → Action
 *
 * HARD RULES:
 *   ❌ DO NOT modify the Canonical Narrative (Layer 13).
 *   ❌ DO NOT mix emotion inside the Canon.
 *   ❌ DO NOT invent new triggers, hooks, or CTAs.
 *   ✅ Hook ALWAYS comes before narrative.
 *   ✅ Always end in outcome (End State from Layer 13).
 *
 * Source of truth. Do NOT inline copies. Import from here.
 * ============================================================================
 */

import { NARRATIVE_RULES, type NarrativeLang } from "./canonical-narrative";

// ----------------------------------------------------------------------------
// 1. EMOTIONAL TRIGGERS — fixed set. Use ONLY these.
// ----------------------------------------------------------------------------
export type EmotionTrigger =
  | "frustration"
  | "confusion"
  | "wasted_time"
  | "desire"
  | "control";

export const EMOTION_TRIGGERS: Readonly<
  Record<EmotionTrigger, { label: string; line: { en: string; de: string } }>
> = Object.freeze({
  frustration: {
    label: "A. Frustration",
    line: {
      en: "Most people try to learn sales and never make real money.",
      de: "Die meisten versuchen, Sales zu lernen — und verdienen nie wirklich Geld.",
    },
  },
  confusion: {
    label: "B. Confusion",
    line: {
      en: "There is no clear path. No structure. No system.",
      de: "Es gibt keinen klaren Weg. Keine Struktur. Kein System.",
    },
  },
  wasted_time: {
    label: "C. Wasted Time",
    line: {
      en: "People spend months learning, but never actually perform.",
      de: "Man verbringt Monate mit Lernen — und performt am Ende trotzdem nicht.",
    },
  },
  desire: {
    label: "D. Desire",
    line: {
      en: "What you actually want is a clear path where performance turns into income.",
      de: "Was du eigentlich willst: einen klaren Weg, auf dem Leistung zu Einkommen wird.",
    },
  },
  control: {
    label: "E. Control",
    line: {
      en: "You want to know exactly what to do, what to improve, and how to progress.",
      de: "Du willst genau wissen, was zu tun ist, was du verbessern musst und wie du aufsteigst.",
    },
  },
});

// ----------------------------------------------------------------------------
// 2. HOOK STRUCTURES — pick exactly one per surface.
// ----------------------------------------------------------------------------
export type HookType = "contrast" | "problem_path" | "identity_shift";

export const HOOK_STRUCTURES: Readonly<
  Record<
    HookType,
    {
      label: string;
      pattern: { en: string; de: string };
      example: { en: string; de: string };
    }
  >
> = Object.freeze({
  contrast: {
    label: "Hook 1 — Contrast",
    pattern: {
      en: "Most people [fail pattern]. This system [clear solution].",
      de: "Die meisten [Fail-Muster]. Dieses System [klare Lösung].",
    },
    example: {
      en: "Most people learn sales and never close real deals. This system turns performance into income — step by step.",
      de: "Die meisten lernen Sales und schließen nie echte Deals ab. Dieses System macht aus Leistung Einkommen — Schritt für Schritt.",
    },
  },
  problem_path: {
    label: "Hook 2 — Problem → Path",
    pattern: {
      en: "Right now: [problem]. What you need: [path].",
      de: "Jetzt gerade: [Problem]. Was du brauchst: [Weg].",
    },
    example: {
      en: "Right now: confusion, no structure, no measurable progress. What you need: a clear path where every step is defined.",
      de: "Jetzt gerade: Verwirrung, keine Struktur, kein messbarer Fortschritt. Was du brauchst: einen klaren Weg, in dem jeder Schritt definiert ist.",
    },
  },
  identity_shift: {
    label: "Hook 3 — Identity Shift",
    pattern: {
      en: "Not just a closer → someone trusted to build revenue.",
      de: "Nicht nur ein Closer → jemand, dem man Umsatz anvertraut.",
    },
    example: {
      en: "Not just a closer. Someone any company would trust to build, lead, and run their sales operation.",
      de: "Nicht nur ein Closer. Jemand, dem jedes Unternehmen den Aufbau und Betrieb seiner Sales-Operation anvertraut.",
    },
  },
});

// ----------------------------------------------------------------------------
// 3. EMOTION → NARRATIVE TRANSITION lines (mandatory bridge).
// ----------------------------------------------------------------------------
export const TRANSITION_LINES = Object.freeze({
  primary: {
    en: "That's exactly why this system exists.",
    de: "Genau dafür existiert dieses System.",
  },
  secondary: {
    en: "That's where ETC comes in.",
    de: "Genau hier kommt ETC ins Spiel.",
  },
} as const);

// ----------------------------------------------------------------------------
// 4. CANONICAL CTA — only these are allowed.
// ----------------------------------------------------------------------------
export const CTA_CANON = Object.freeze({
  primary: {
    en: "Start Your Application",
    de: "Bewerbung starten",
  },
  secondary: {
    en: "See if you qualify",
    de: "Prüfen, ob du qualifiziert bist",
  },
} as const);

// ----------------------------------------------------------------------------
// 5. CANONICAL LANDING FLOW — fixed 9-section order.
// ----------------------------------------------------------------------------
export type LandingSection =
  | "emotion_hook"
  | "problem_amplification"
  | "transition"
  | "canonical_narrative"
  | "path"
  | "economics"
  | "end_state"
  | "proof"
  | "cta";

export const LANDING_FLOW: readonly LandingSection[] = Object.freeze([
  "emotion_hook",
  "problem_amplification",
  "transition",
  "canonical_narrative",
  "path",
  "economics",
  "end_state",
  "proof",
  "cta",
]);

export const LANDING_FLOW_LABELS: Readonly<Record<LandingSection, string>> =
  Object.freeze({
    emotion_hook: "1. Emotional Hook",
    problem_amplification: "2. Problem Amplification",
    transition: "3. Transition → System",
    canonical_narrative: "4. Canonical Narrative (20s → 60s)",
    path: "5. Path (visual)",
    economics: "6. Economics",
    end_state: "7. End State",
    proof: "8. Proof",
    cta: "9. CTA",
  });

// ----------------------------------------------------------------------------
// 6. HARD RULES — machine-readable governance.
// ----------------------------------------------------------------------------
export const EMOTION_RULES = Object.freeze({
  hookBeforeNarrative: true,
  emotionMustNotMixIntoCanon: true,
  allowedTriggers: Object.keys(EMOTION_TRIGGERS) as EmotionTrigger[],
  allowedHooks: Object.keys(HOOK_STRUCTURES) as HookType[],
  allowedCtas: ["primary", "secondary"] as const,
  proofRequired: true,
  endsInOutcome: true,
} as const);

// ----------------------------------------------------------------------------
// 7. HELPERS
// ----------------------------------------------------------------------------
export function getTrigger(t: EmotionTrigger, lang: NarrativeLang = "en"): string {
  return EMOTION_TRIGGERS[t].line[lang];
}

export function getHookExample(h: HookType, lang: NarrativeLang = "en"): string {
  return HOOK_STRUCTURES[h].example[lang];
}

export function getTransition(
  variant: keyof typeof TRANSITION_LINES = "primary",
  lang: NarrativeLang = "en",
): string {
  return TRANSITION_LINES[variant][lang];
}

export function getCta(
  variant: keyof typeof CTA_CANON = "primary",
  lang: NarrativeLang = "en",
): string {
  return CTA_CANON[variant][lang];
}

// ----------------------------------------------------------------------------
// 8. VALIDATION — 4 mandatory checks for any conversion surface.
// ----------------------------------------------------------------------------
export type ConversionCheck = {
  passed: boolean;
  failures: string[];
  warnings: string[];
};

export type ConversionInput = {
  hook?: string;
  transition?: string;
  endState?: string;
  body?: string;
  proof?: { count: number } | undefined;
  cta?: string;
};

/**
 * Validates a conversion surface against the Emotion + Narrative canons.
 *
 *   CHECK 1: Starts with emotion (hook present)
 *   CHECK 2: Transitions into narrative (transition line present)
 *   CHECK 3: Ends with outcome (End State present)
 *   CHECK 4: Avoids internal terminology (uses Layer 13 forbidden list)
 *
 * Plus: proof is required (CRITICAL CONVERSION GAP if missing).
 */
export function validateConversionSurface(input: ConversionInput): ConversionCheck {
  const failures: string[] = [];
  const warnings: string[] = [];

  // CHECK 1
  if (!input.hook || input.hook.trim().length < 10) {
    failures.push("CHECK 1 FAILED: missing or too-short emotional hook.");
  }
  // CHECK 2
  if (!input.transition || input.transition.trim().length < 5) {
    failures.push("CHECK 2 FAILED: missing emotion → narrative transition line.");
  }
  // CHECK 3
  if (!input.endState || input.endState.trim().length < 20) {
    failures.push("CHECK 3 FAILED: surface does not end with outcome (End State).");
  }
  // CHECK 4 — forbidden internal terminology (reuses Layer 13 list)
  const combined = [input.hook, input.body, input.endState, input.cta]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const term of NARRATIVE_RULES.forbiddenComplexity) {
    if (combined.includes(term.toLowerCase())) {
      failures.push(`CHECK 4 FAILED: forbidden internal term "${term}" leaked into copy.`);
    }
  }
  // PROOF
  if (!input.proof || input.proof.count <= 0) {
    failures.push("CRITICAL CONVERSION GAP: proof (results / numbers / testimonials) missing.");
  }
  // CTA
  const allowedCtas: readonly string[] = [
    CTA_CANON.primary.en,
    CTA_CANON.primary.de,
    CTA_CANON.secondary.en,
    CTA_CANON.secondary.de,
  ];
  if (input.cta && !allowedCtas.includes(input.cta)) {
    warnings.push(
      `CTA "${input.cta}" is not canonical. Use "${CTA_CANON.primary.en}" or "${CTA_CANON.secondary.en}".`,
    );
  }

  return { passed: failures.length === 0, failures, warnings };
}

/**
 * Dev-mode guard. Throws in non-prod when conversion copy violates the canon.
 * Use in CI / story tests, not in render paths.
 */
export function assertConversionSafe(input: ConversionInput): void {
  if (import.meta.env?.PROD) return;
  const result = validateConversionSurface(input);
  if (!result.passed) {
    throw new Error(
      `[EmotionCanon] Conversion surface violates canon:\n  - ${result.failures.join("\n  - ")}`,
    );
  }
}
