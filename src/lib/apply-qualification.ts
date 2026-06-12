// Apply Quiz – Selektions- & Commitment-Scoring
// Kompatibel mit bestehendem quiz_submissions / Event-System.
//
// V1 (default, unverändert):
//   6 Fragen, Score 0–94, Buckets: high ≥ 70, mid 40–69, low < 40
//
// V2 (additiv, A/B-gated über sessionStorage `apply_v2_enabled`):
//   8 Fragen (+ commitment, + velocity), Score 0–124
//   Thresholds proportional rescaled: high ≥ 92, mid 53–91, low < 53
//   → identische Filter-Tightness wie V1 (high ≈ 0.745, mid ≈ 0.425).
//
// HARTER FILTER (beide Versionen): real_calls = "Nein" → bucket = low

export type ApplyAnswerId =
  | "motivation"
  | "ambition"
  | "real_calls"
  | "time"
  | "experience"
  | "income_goal"
  | "commitment"   // V2 only
  | "velocity"     // V2 only
  | "income_target"; // additive final question — outcome signal only, no score impact

export interface ApplyOption {
  label: string;
  value: number;
  flag?: "hard_block";
}

export interface ApplyQuestion {
  id: ApplyAnswerId;
  question: string;
  subtitle?: string;
  options: ApplyOption[];
}

// ── V1 base set (unverändert) ────────────────────────────────────────────
export const APPLY_QUESTIONS: ApplyQuestion[] = [
  {
    id: "motivation",
    question: "Warum interessiert dich Closing?",
    subtitle: "Es gibt keine falsche Antwort. Sei ehrlich.",
    options: [
      { label: "Ich will mein Einkommen steigern.", value: 8 },
      { label: "Ich will eine echte Fähigkeit lernen.", value: 10 },
      { label: "Ich bin unzufrieden in meinem Job.", value: 6 },
      { label: "Etwas anderes.", value: 4 },
    ],
  },
  {
    id: "ambition",
    question: "Wie ernst meinst du es aktuell?",
    options: [
      { label: "Ich schaue mich nur um.", value: 2 },
      { label: "Ich will es ausprobieren.", value: 6 },
      { label: "Ich will es wirklich lernen.", value: 12 },
      { label: "Ich will auf Top-Level performen.", value: 18 },
    ],
  },
  {
    id: "real_calls",
    question: "Bist du bereit, echte Verkaufsgespräche zu führen?",
    subtitle:
      "Simulator-Training, Coaching und echte Verkaufsgespräche ab Woche 2.",
    options: [
      { label: "Nein.", value: 0, flag: "hard_block" },
      { label: "Vielleicht.", value: 5 },
      { label: "Ja.", value: 18 },
    ],
  },
  {
    id: "time",
    question: "Wie viel Zeit kannst du pro Woche investieren?",
    // Bewusst gleich gewichtet: ETC ist ein Karriereweg, der parallel zum
    // Vollzeitjob startet. Wir bestrafen keine High-Quality-Kandidaten mit
    // wenig Wochenbudget, solange sie mindestens 5h/Woche investieren können.
    options: [
      { label: "Weniger als 5 Stunden.", value: 2 },
      { label: "5–10 Stunden.", value: 14 },
      { label: "10–20 Stunden.", value: 14 },
      { label: "Mehr als 20 Stunden.", value: 14 },
    ],
  },
  {
    id: "experience",
    question: "Hast du Erfahrung im Verkauf oder Coaching?",
    options: [
      { label: "Keine Erfahrung.", value: 6 },
      { label: "Wenig.", value: 9 },
      { label: "Mittel.", value: 12 },
      { label: "Fortgeschritten.", value: 14 },
    ],
  },
  {
    // Hinweis: ID bleibt "income_goal" (Schema-Kompatibilität downstream),
    // semantisch ist es jetzt ein Outcome-Signal — Selection over Pressure.
    id: "income_goal",
    question: "Wofür möchtest du Closing lernen?",
    subtitle: "Wir messen Wirkung, nicht Einkommensfantasien.",
    options: [
      { label: "Ortsunabhängig arbeiten.", value: 10 },
      { label: "Mehr Kontrolle über meine Zeit gewinnen.", value: 12 },
      { label: "Eine neue Karriere aufbauen.", value: 16 },
      { label: "Zusätzliches Einkommen aufbauen.", value: 8 },
      { label: "High-Ticket Vertrieb meistern.", value: 14 },
    ],
  },
];

// ── V2 additions (Commitment "Variant C" + Intent Velocity) ──────────────
// Soft signals only — no hard block. Selection over Pressure.
const APPLY_V2_EXTRAS: ApplyQuestion[] = [
  {
    id: "commitment",
    question: "Welcher Satz beschreibt dich heute am besten?",
    subtitle: "Keine richtige Antwort. Nur Klarheit.",
    options: [
      { label: "Ich gehe all-in.", value: 16 },
      { label: "Ich will lernen und parallel verdienen.", value: 12 },
      { label: "Ich teste vorsichtig, bevor ich mich festlege.", value: 4 },
      { label: "Ich schaue mich erst einmal um.", value: 2 },
    ],
  },
  {
    id: "velocity",
    question: "Wann willst du dein erstes Closing-Einkommen generieren?",
    options: [
      { label: "In den nächsten 30 Tagen.", value: 14 },
      { label: "In den nächsten 90 Tagen.", value: 9 },
      { label: "Irgendwann 2026.", value: 4 },
      { label: "Weiß ich nicht.", value: 2 },
    ],
  },
];

// ── Final outcome question (always last, both V1 & V2) ──────────────────
// Purely informational — value=0 across all options so it cannot influence
// scoring or bucketing. Captured as `income_target` in the server payload.
const APPLY_INCOME_TARGET: ApplyQuestion = {
  id: "income_target",
  question: "Wie viel möchtest du als Closer monatlich verdienen?",
  subtitle: "Nur als Orientierung — leistungsbasiert, keine Garantie.",
  options: [
    { label: "2.000 – 5.000 €", value: 0 },
    { label: "5.000 – 10.000 €", value: 0 },
    { label: "10.000 – 20.000 €", value: 0 },
    { label: "20.000 €+", value: 0 },
  ],
};

export function getApplyQuestions(v2: boolean): ApplyQuestion[] {
  return v2
    ? [...APPLY_QUESTIONS, ...APPLY_V2_EXTRAS, APPLY_INCOME_TARGET]
    : [...APPLY_QUESTIONS, APPLY_INCOME_TARGET];
}

export type ApplyBucket = "high" | "mid" | "low";

export interface ApplyResult {
  score: number;
  bucket: ApplyBucket;
  hardBlocked: boolean;
  v2: boolean;
  velocity?: "30d" | "90d" | "2026" | "unknown" | null;
  commitment?: "all_in" | "learn_earn" | "test" | "browse" | null;
  answers: { id: ApplyAnswerId; label: string; value: number }[];
}

const VELOCITY_MAP: Record<number, ApplyResult["velocity"]> = {
  0: "30d",
  1: "90d",
  2: "2026",
  3: "unknown",
};
const COMMITMENT_MAP: Record<number, ApplyResult["commitment"]> = {
  0: "all_in",
  1: "learn_earn",
  2: "test",
  3: "browse",
};

export function calculateApplyResult(
  selections: { id: ApplyAnswerId; optionIndex: number }[],
  v2 = false,
): ApplyResult {
  const questions = getApplyQuestions(v2);
  let score = 0;
  let hardBlocked = false;
  let velocity: ApplyResult["velocity"] = null;
  let commitment: ApplyResult["commitment"] = null;
  const answers: ApplyResult["answers"] = [];

  for (const sel of selections) {
    const q = questions.find((x) => x.id === sel.id);
    if (!q) continue;
    const opt = q.options[sel.optionIndex];
    if (!opt) continue;
    score += opt.value;
    if (opt.flag === "hard_block") hardBlocked = true;
    if (sel.id === "velocity") velocity = VELOCITY_MAP[sel.optionIndex] ?? null;
    if (sel.id === "commitment") commitment = COMMITMENT_MAP[sel.optionIndex] ?? null;
    answers.push({ id: sel.id, label: opt.label, value: opt.value });
  }

  // Thresholds proportional to max (V1: 70/40 of 94; V2: 92/53 of 124).
  const highCut = v2 ? 92 : 70;
  const midCut = v2 ? 53 : 40;

  let bucket: ApplyBucket;
  if (hardBlocked) bucket = "low";
  else if (score >= highCut) bucket = "high";
  else if (score >= midCut) bucket = "mid";
  else bucket = "low";

  return { score, bucket, hardBlocked, v2, velocity, commitment, answers };
}
