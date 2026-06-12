/**
 * ============================================================================
 * LAYER 13 — CANONICAL NARRATIVE (ETC)
 * ============================================================================
 *
 * The single, immutable explanation of the ETC system.
 * Same structure, same words, every surface: sales, landing, onboarding, team.
 *
 * HARD RULES:
 *   1. NO VARIATIONS — this narrative is fixed.
 *   2. SAME STRUCTURE EVERYWHERE — Entry → System → Progression → Performance → Earnings → Outcome.
 *   3. NO EXTRA COMPLEXITY — no internal terminology, no technical jargon.
 *   4. ALIGN WITH SYSTEM — must match canonical levels, KPIs, naming, economics.
 *
 * Source of truth. Do NOT inline copies elsewhere — import from here.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. TAGLINE — one sentence
// ----------------------------------------------------------------------------
export const NARRATIVE_TAGLINE = {
  en: "A performance-based career system that turns beginners into high-income closers through structure, measurement, and execution.",
  de: "Ein leistungsbasiertes Karrieresystem, das Einsteiger durch Struktur, Messung und Ausführung zu Top-Closern macht.",
} as const;

// ----------------------------------------------------------------------------
// 2. 20-SECOND VERSION — entry / hero
// ----------------------------------------------------------------------------
export const NARRATIVE_20S = {
  en: "Ethical Top Closer is a performance-based system that takes you from zero to high-income closer through a structured career path. You enter as an applicant, move through defined levels, and get paid based on real results — while the system tracks your performance and shows you exactly how to improve.",
  de: "Ethical Top Closer ist ein leistungsbasiertes System, das dich über einen strukturierten Karriereweg vom Nullpunkt zum Top-Closer führt. Du startest als Bewerber, durchläufst klar definierte Level und wirst nach echten Resultaten bezahlt — während das System deine Leistung misst und dir exakt zeigt, wie du dich verbesserst.",
} as const;

// ----------------------------------------------------------------------------
// 2b. END-STATE VARIANTS — three approved framings of "what you become".
//     Use the right one for the right surface. Never invent new ones.
// ----------------------------------------------------------------------------
export const NARRATIVE_END_STATE = Object.freeze({
  /** Core — used inside the 3-minute narrative (PART 6). */
  core: {
    en: "The end goal is to become a Senior Closer who not only closes deals at a high level, but understands the full system, operates it effectively, and can guide a team with clarity, performance, and integrity.",
    de: "Das Ziel ist es, ein Senior Closer zu werden, der nicht nur auf höchstem Niveau abschließt, sondern das gesamte System versteht, es effektiv betreibt und ein Team mit Klarheit, Leistung und Integrität führen kann.",
  },
  /** High-impact — for sales pages, positioning, pitch decks. */
  highImpact: {
    en: "The end goal is to become a Senior Closer who doesn't just close deals, but can operate and scale a sales system — someone any company would trust to build, lead, and perform at the highest level.",
    de: "Das Ziel ist es, ein Senior Closer zu werden, der nicht nur abschließt, sondern ein Sales-System operieren und skalieren kann — jemand, dem jedes Unternehmen vertraut, auf höchstem Niveau aufzubauen, zu führen und zu performen.",
  },
  /** Full expression — for hero outcome blocks, manifesto, deep onboarding. */
  full: {
    en: "The end goal is to become a Senior Closer who not only closes deals, but understands the full system, operates it at a high level, and can guide a team with clarity and consistency. Someone who is comparable, competitive, and trusted — someone any company would want in their team or rely on to build and run their sales operation. An Ethical Top Closer.",
    de: "Das Ziel ist es, ein Senior Closer zu werden, der nicht nur abschließt, sondern das gesamte System versteht, es auf höchstem Niveau betreibt und ein Team mit Klarheit und Konsistenz führen kann. Jemand, der vergleichbar, wettbewerbsfähig und vertrauenswürdig ist — jemand, den jedes Unternehmen im Team haben möchte oder dem es den Aufbau und Betrieb seiner Sales-Operation anvertraut. Ein Ethical Top Closer.",
  },
} as const);

export type EndStateVariant = keyof typeof NARRATIVE_END_STATE;

// ----------------------------------------------------------------------------
// 3. 60-SECOND VERSION — core explanation
// ----------------------------------------------------------------------------
export const NARRATIVE_60S = {
  en: `The ETC platform works in two parts.
First, the acquisition system brings in applicants, qualifies them, and converts them into members.
Second, the career system moves members from trainee to setter to closer to senior closer and beyond.
Each level has clear KPIs, clear earnings, and clear responsibilities.
The system tracks your performance, compares it to benchmarks, and shows you exactly what to improve.
Communication and automation guide you through each step, so you always know what to do next.
The goal is simple: turn you into a high-performing closer — and eventually into someone who can operate and lead a sales system.`,
  de: `Die ETC-Plattform besteht aus zwei Teilen.
Erstens das Acquisition-System, das Bewerber gewinnt, qualifiziert und in Mitglieder verwandelt.
Zweitens das Karriere-System, in dem Mitglieder vom Trainee über Setter und Closer bis zum Senior Closer und darüber hinaus aufsteigen.
Jedes Level hat klare KPIs, klare Earnings und klare Verantwortlichkeiten.
Das System misst deine Leistung kontinuierlich, vergleicht sie mit Benchmarks und zeigt dir exakt, was du verbessern musst.
Kommunikation und Automation begleiten dich durch jeden Schritt, damit du immer weißt, was als Nächstes zu tun ist.
Das Ziel ist einfach: dich zum leistungsstarken Closer zu machen — und schließlich zu jemandem, der ein Sales-System operieren und führen kann.`,
} as const;

// ----------------------------------------------------------------------------
// 4. 3-MINUTE VERSION — full canonical explanation in 6 fixed parts
// ----------------------------------------------------------------------------
export type NarrativePart = {
  key: "entry" | "career" | "performance" | "support" | "economics" | "outcome";
  title: { en: string; de: string };
  body: { en: string; de: string };
};

export const NARRATIVE_FULL: readonly NarrativePart[] = Object.freeze([
  {
    key: "entry",
    title: { en: "1. Entry", de: "1. Einstieg" },
    body: {
      en: "Everything starts with the acquisition system. People come in through landing pages, go through a qualification process, book a call, and either get accepted or not. That's Level 0.",
      de: "Alles beginnt mit dem Acquisition-System. Interessenten kommen über Landingpages, durchlaufen einen Qualifizierungsprozess, buchen ein Gespräch und werden entweder angenommen oder nicht. Das ist Level 0.",
    },
  },
  {
    key: "career",
    title: { en: "2. Career Path", de: "2. Karriereweg" },
    body: {
      en: "Once accepted, you enter the career system. You start as a trainee, then move to associate setter, senior setter, junior closer, closer, and eventually senior closer. Each level has defined KPIs, and progression is purely performance-based.",
      de: "Sobald du angenommen bist, beginnt das Karriere-System. Du startest als Trainee, dann Associate Setter, Senior Setter, Junior Closer, Managing Closer und schließlich Senior Closer. Jedes Level hat klar definierte KPIs, und Aufstieg ist rein leistungsbasiert.",
    },
  },
  {
    key: "performance",
    title: { en: "3. Performance System", de: "3. Performance-System" },
    body: {
      en: "Your performance is measured continuously through clear KPIs — like calls, show rates, close rates, and revenue. These KPIs determine your level, your income, and your progression.",
      de: "Deine Leistung wird kontinuierlich über klare KPIs gemessen — Calls, Show Rate, Close Rate und Revenue. Diese KPIs bestimmen dein Level, dein Einkommen und deinen Aufstieg.",
    },
  },
  {
    key: "support",
    title: { en: "4. System Support", de: "4. System-Support" },
    body: {
      en: "The platform supports you through tools, training, and automation. It tells you what to do next, reminds you, and helps you improve your results.",
      de: "Die Plattform unterstützt dich durch Tools, Training und Automation. Sie sagt dir, was als Nächstes zu tun ist, erinnert dich und hilft dir, deine Ergebnisse zu verbessern.",
    },
  },
  {
    key: "economics",
    title: { en: "5. Economics", de: "5. Ökonomie" },
    body: {
      en: "You earn based on real output. Setters earn per qualified call, closers earn per deal, and senior closers operate their own pipeline and scale income further.",
      de: "Du verdienst nach echter Leistung. Setter verdienen pro qualifiziertem Call, Closer pro Abschluss, und Senior Closer betreiben ihre eigene Pipeline und skalieren ihr Einkommen weiter.",
    },
  },
  {
    key: "outcome",
    title: { en: "6. End State", de: "6. Zielzustand" },
    body: {
      en: "The end goal is to become a Senior Closer who not only closes deals at a high level, but understands the full system, operates it effectively, and can guide a team with clarity and consistency. Someone who is trusted to build, run, and scale a sales operation — someone any company would want in their team or rely on to drive revenue. An Ethical Top Closer.",
      de: "Das Ziel ist es, ein Senior Closer zu werden, der nicht nur auf höchstem Niveau abschließt, sondern das gesamte System versteht, es effektiv betreibt und ein Team mit Klarheit und Konsistenz führen kann. Jemand, dem man vertraut, eine Sales-Operation aufzubauen, zu führen und zu skalieren — jemand, den jedes Unternehmen im Team haben möchte oder dem es seinen Umsatz anvertraut. Ein Ethical Top Closer.",
    },
  },
]);

// ----------------------------------------------------------------------------
// 5. VISUAL LOGIC — fixed flow for landing / decks / dashboards
// ----------------------------------------------------------------------------
export const NARRATIVE_FLOW: readonly string[] = Object.freeze([
  "Lead",
  "Applicant",
  "Trainee",
  "Setter",
  "Closer",
  "Senior Closer",
]);

// ----------------------------------------------------------------------------
// 6. NARRATIVE STRUCTURE LOCK — the 6 mandatory sections, in order
// ----------------------------------------------------------------------------
export const NARRATIVE_STRUCTURE: readonly NarrativePart["key"][] = Object.freeze([
  "entry",
  "career",
  "performance",
  "support",
  "economics",
  "outcome",
]);

// ----------------------------------------------------------------------------
// 7. HARD RULES — machine-readable governance
// ----------------------------------------------------------------------------
export const NARRATIVE_RULES = Object.freeze({
  noVariations: true,
  fixedStructure: NARRATIVE_STRUCTURE,
  forbiddenComplexity: [
    "OSS",
    "PSP",
    "Operator", // internal-only term — never in narrative (use "Senior Closer")
    "Engine",
    "Layer",
    "Canonical",
    "MECE",
  ],
  mustAlignWith: ["canonical-roles.ts", "operational-canon.ts"],
} as const);

// ----------------------------------------------------------------------------
// 8. HELPERS
// ----------------------------------------------------------------------------
export type NarrativeLength = "tagline" | "20s" | "60s" | "full";
export type NarrativeLang = "en" | "de";

export function getNarrative(length: NarrativeLength, lang: NarrativeLang = "en"): string {
  switch (length) {
    case "tagline":
      return NARRATIVE_TAGLINE[lang];
    case "20s":
      return NARRATIVE_20S[lang];
    case "60s":
      return NARRATIVE_60S[lang];
    case "full":
      return NARRATIVE_FULL.map((p) => `${p.title[lang]}\n${p.body[lang]}`).join("\n\n");
  }
}

/** Returns one of the three approved End-State framings. */
export function getEndState(
  variant: EndStateVariant = "core",
  lang: NarrativeLang = "en",
): string {
  return NARRATIVE_END_STATE[variant][lang];
}

/**
 * Dev-mode guard. Throws in non-prod if forbidden internal terms leak into
 * narrative-bound copy. Use in CI / story-level tests, not in render paths.
 */
export function assertNarrativeSafe(text: string): void {
  if (import.meta.env?.PROD) return;
  const lower = text.toLowerCase();
  for (const term of NARRATIVE_RULES.forbiddenComplexity) {
    if (lower.includes(term.toLowerCase())) {
      throw new Error(
        `[CanonicalNarrative] Forbidden term "${term}" detected in narrative copy. ` +
          `Use only the approved language from src/lib/canonical-narrative.ts.`,
      );
    }
  }
}
