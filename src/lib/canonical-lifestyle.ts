/**
 * Layer 16 — Canonical Lifestyle & Freedom Canon (LOCKED)
 *
 * Sits BEFORE Layer 15 (Charisma) → Layer 14 (Emotion) → Layer 13 (Narrative).
 * Activates desire for: remote work, freedom, income growth, community.
 *
 * Core principle: Lifestyle → Emotion → Narrative → Proof → Action
 *
 * HARD RULES:
 *  ❌ Do NOT modify the Canonical Narrative (Layer 13).
 *  ❌ Do NOT exaggerate ("get rich quick", guaranteed income, overnight).
 *  ❌ Do NOT create new desire angles outside the locked set.
 *  ✅ MUST create aspiration, identity shift, lifestyle → system bridge.
 */

export type Lang = "en" | "de";

export type DesireAngleKey =
  | "freedom"
  | "remote_lifestyle"
  | "income_shift"
  | "speed"
  | "security_through_system"
  | "community"
  | "impact";

export interface DesireAngle {
  key: DesireAngleKey;
  label: { en: string; de: string };
  body: { en: string; de: string };
}

/** 7 fixed desire angles. No additions allowed. */
export const DESIRE_ANGLES: readonly DesireAngle[] = [
  {
    key: "freedom",
    label: { en: "Freedom", de: "Freiheit" },
    body: {
      en: "Exit the 9-to-5. No boss. No fixed schedule. You decide when and where you work.",
      de: "Raus aus dem 9-to-5. Kein Chef. Keine festen Zeiten. Du entscheidest, wann und wo du arbeitest.",
    },
  },
  {
    key: "remote_lifestyle",
    label: { en: "Remote lifestyle", de: "Ortsunabhängig leben" },
    body: {
      en: "Work from anywhere. Not just from home — from places you actually want to be.",
      de: "Arbeite von überall. Nicht nur von zu Hause — von Orten, an denen du wirklich sein willst.",
    },
  },
  {
    key: "income_shift",
    label: { en: "Income shift", de: "Einkommens-Shift" },
    body: {
      en: "Build an income that scales with performance — not hours.",
      de: "Baue ein Einkommen, das mit Leistung skaliert — nicht mit Stunden.",
    },
  },
  {
    key: "speed",
    label: { en: "Speed", de: "Geschwindigkeit" },
    body: {
      en: "Not years. Within weeks, you are inside real calls and real deals.",
      de: "Keine Jahre. Innerhalb von Wochen bist du in echten Calls und echten Deals.",
    },
  },
  {
    key: "security_through_system",
    label: { en: "Security through system", de: "Sicherheit durch System" },
    body: {
      en: "If you follow the system and hit the KPIs, you create predictable progress.",
      de: "Wenn du dem System folgst und die KPIs triffst, entsteht planbarer Fortschritt.",
    },
  },
  {
    key: "community",
    label: { en: "Community", de: "Community" },
    body: {
      en: "You are not doing this alone. You are surrounded by people on the same path — ambitious, international, driven.",
      de: "Du machst das nicht alleine. Um dich herum: Menschen auf demselben Weg — ambitioniert, international, getrieben.",
    },
  },
  {
    key: "impact",
    label: { en: "Impact", de: "Wirkung" },
    body: {
      en: "You don't convince people. You guide them toward decisions that actually improve their lives.",
      de: "Du überredest niemanden. Du führst Menschen zu Entscheidungen, die ihr Leben wirklich verbessern.",
    },
  },
] as const;

/** Locked opening hook — strongest version. */
export const LIFESTYLE_HOOK = {
  en: {
    body: [
      "Most people stay stuck in a 9-to-5 they don't want.",
      "Fixed hours. Fixed income. Limited freedom.",
      "",
      "What they actually want is simple:",
      "to work remotely, earn based on performance, and build a life on their own terms.",
    ].join("\n"),
    transition: "That's exactly what this system is built for.",
  },
  de: {
    body: [
      "Die meisten Menschen stecken in einem 9-to-5 fest, das sie nicht wollen.",
      "Feste Zeiten. Festes Einkommen. Begrenzte Freiheit.",
      "",
      "Was sie wirklich wollen, ist einfach:",
      "ortsunabhängig arbeiten, leistungsbasiert verdienen und ein Leben nach den eigenen Regeln bauen.",
    ].join("\n"),
    transition: "Genau dafür ist dieses System gebaut.",
  },
} as const;

/** Lifestyle expansion section — bullet list of life outcomes. */
export const LIFESTYLE_EXPANSION = {
  intro: {
    en: "This is not just about learning sales. It's about building a completely different lifestyle.",
    de: "Es geht nicht nur darum, Sales zu lernen. Es geht darum, einen komplett anderen Lebensstil zu bauen.",
  },
  bullets: {
    en: [
      "Remote work from anywhere",
      "Travel and live where you want",
      "Choose your partners and projects",
      "Work with people you actually respect",
      "Meet like-minded people internationally",
      "Join meetups, events, and real-world gatherings",
    ],
    de: [
      "Ortsunabhängig arbeiten",
      "Reisen und leben, wo du willst",
      "Wähle deine Partner und Projekte",
      "Arbeite mit Menschen, die du wirklich respektierst",
      "Triff Gleichgesinnte international",
      "Meetups, Events und echte Begegnungen",
    ],
  },
} as const;

/** Community block — high emotional value, real-world bridge. */
export const COMMUNITY_BLOCK = {
  en: [
    "One of the biggest advantages is the community.",
    "",
    "You are surrounded by people who are building the same path —",
    "internationally, ambitious, and performance-driven.",
    "",
    "You meet, you exchange, you grow together.",
    "Not just online — in real life.",
  ].join("\n"),
  de: [
    "Einer der größten Vorteile ist die Community.",
    "",
    "Um dich herum sind Menschen, die denselben Weg bauen —",
    "international, ambitioniert, leistungsorientiert.",
    "",
    "Ihr trefft euch, tauscht euch aus, wachst gemeinsam.",
    "Nicht nur online — auch im echten Leben.",
  ].join("\n"),
} as const;

/** Identity shift — what you become, not what you learn. */
export const IDENTITY_SHIFT = {
  intro: {
    en: "You are not just learning a skill. You are becoming someone who:",
    de: "Du lernst nicht nur einen Skill. Du wirst jemand, der:",
  },
  bullets: {
    en: [
      "generates revenue",
      "is trusted by partners",
      "operates at a high level",
      "builds their own life on their own terms",
    ],
    de: [
      "Umsatz generiert",
      "von Partnern vertraut wird",
      "auf hohem Niveau operiert",
      "sein eigenes Leben nach eigenen Regeln baut",
    ],
  },
} as const;

/**
 * Mandatory section order for any lifestyle-led surface.
 * Layer 16 prepends sections 1–3 BEFORE Layer 13's narrative flow.
 */
export const LIFESTYLE_FLOW_ORDER = [
  "lifestyle_hook",          // 1. Lifestyle Hook
  "desire_expansion",        // 2. Desire Expansion
  "transition",              // 3. Transition → System
  "canonical_narrative",     // 4. Layer 13 (20s narrative) — UNCHANGED
  "system",                  // 5. System
  "path",                    // 6. Path (L1–L8)
  "economics",               // 7. Economics
  "end_state",               // 8. End State (Layer 15 locked)
] as const;

export type LifestyleSection = (typeof LIFESTYLE_FLOW_ORDER)[number];

/** Helpers ------------------------------------------------------------- */

export function getDesireAngle(
  key: DesireAngleKey,
  lang: Lang = "en"
): { label: string; body: string } {
  const angle = DESIRE_ANGLES.find((a) => a.key === key);
  if (!angle) throw new Error(`Unknown desire angle: ${key}`);
  return { label: angle.label[lang], body: angle.body[lang] };
}

export function getLifestyleHook(lang: Lang = "en") {
  return LIFESTYLE_HOOK[lang];
}

/** Validation ---------------------------------------------------------- */

export interface LifestyleValidationInput {
  /** Concatenated copy of the surface, in order. */
  copy: string;
  /** Section keys present, in render order. */
  sections: LifestyleSection[];
  lang?: Lang;
}

export interface LifestyleValidationResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

const HYPE_PATTERNS: RegExp[] = [
  /\bget rich quick\b/i,
  /\bovernight\b/i,
  /\bguaranteed income\b/i,
  /\bpassive income\b/i,
  /\bno work\b/i,
  /\bschnell reich\b/i,
  /\bgarantiert(es)? einkommen\b/i,
];

export function validateLifestyleSurface(
  input: LifestyleValidationInput
): LifestyleValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // CHECK 1 — Lifestyle hook must come before narrative.
  const hookIdx = input.sections.indexOf("lifestyle_hook");
  const narrIdx = input.sections.indexOf("canonical_narrative");
  if (hookIdx === -1) failures.push("Missing lifestyle_hook (Layer 16 entry).");
  if (narrIdx !== -1 && hookIdx !== -1 && hookIdx > narrIdx) {
    failures.push("lifestyle_hook must precede canonical_narrative.");
  }

  // CHECK 2 — Desire expansion required.
  if (!input.sections.includes("desire_expansion")) {
    failures.push("Missing desire_expansion section.");
  }

  // CHECK 3 — Transition line required.
  if (!input.sections.includes("transition")) {
    failures.push("Missing transition into system/narrative.");
  }

  // CHECK 4 — End state must close the surface.
  if (!input.sections.includes("end_state")) {
    failures.push("Missing end_state (Senior Closer outcome).");
  }

  // CHECK 5 — No hype/get-rich-quick language.
  for (const re of HYPE_PATTERNS) {
    if (re.test(input.copy)) {
      failures.push(`Hype/unrealistic claim detected: ${re}`);
    }
  }

  // CHECK 6 — Community angle SHOULD appear (high-leverage).
  if (!/community|gleichgesinnt|meetup/i.test(input.copy)) {
    warnings.push("Community angle missing — strongest lifestyle lever.");
  }

  return { passed: failures.length === 0, failures, warnings };
}

export function assertLifestyleSafe(input: LifestyleValidationInput): void {
  const result = validateLifestyleSurface(input);
  if (!result.passed && import.meta.env?.DEV) {
    throw new Error(
      `[Layer 16 Lifestyle Canon] Violation:\n${result.failures.join("\n")}`
    );
  }
}
