/**
 * ETC Qualification Engine
 *
 * Weighted scoring model for lead pre-qualification.
 * Score determines routing: direct_closer / setter_flow / no_call.
 */

export interface QualificationQuestion {
  id: string;
  question: string;
  options: { label: string; value: number }[];
}

export const QUALIFICATION_QUESTIONS: QualificationQuestion[] = [
  {
    id: "situation",
    question: "Was beschreibt deine aktuelle Situation am besten?",
    options: [
      { label: "Ich brauche dringend Einkommen", value: 3 },
      { label: "Ich will aus meinem Job raus", value: 2 },
      { label: "Ich will mir etwas Starkes aufbauen", value: 2 },
      { label: "Ich suche nur nach Möglichkeiten", value: 0 },
    ],
  },
  {
    id: "commitment",
    question: "Wie viel Zeit kannst du realistisch investieren?",
    options: [
      { label: "2+ Stunden täglich", value: 3 },
      { label: "1–2 Stunden täglich", value: 2 },
      { label: "Unregelmäßig", value: 1 },
      { label: "Kaum Zeit", value: 0 },
    ],
  },
  {
    id: "urgency",
    question: "Wie dringend ist deine Situation aktuell?",
    options: [
      { label: "Sehr dringend (ich muss handeln)", value: 3 },
      { label: "Wichtig, aber nicht dringend", value: 2 },
      { label: "Eher optional", value: 0 },
    ],
  },
  {
    id: "ownership",
    question: "Was trifft am ehesten auf dich zu?",
    options: [
      { label: "Ich übernehme Verantwortung und ziehe durch", value: 3 },
      { label: "Ich brauche noch Orientierung", value: 2 },
      { label: "Ich bin unsicher", value: 1 },
      { label: "Ich teste nur", value: 0 },
    ],
  },
  {
    id: "intent",
    question: "Was ist dein Hauptziel?",
    options: [
      { label: "Einkommen aufbauen", value: 2 },
      { label: "Hochwertige Skill lernen", value: 2 },
      { label: "Freiheit / Reisen", value: 1 },
      { label: "Einfach mal schauen", value: 0 },
    ],
  },
];

/**
 * Masterclass-intent question set.
 *
 * Same 5 question IDs and identical option values as the default set, so the
 * existing positional scoring in `calculateQualification` stays valid. We only
 * reorder (intent + commitment first, urgency last) and reframe wording so the
 * flow matches a soft-yes "ich will die Masterclass" mindset instead of a
 * hard-yes "ich brauche dringend Einkommen" mindset.
 */
export const QUALIFICATION_QUESTIONS_MASTERCLASS: QualificationQuestion[] = [
  {
    id: "intent",
    question: "Warum willst du dir die Masterclass ansehen?",
    options: [
      { label: "Ich will eine echte High-Income-Skill lernen", value: 2 },
      { label: "Ich will langfristig Einkommen aufbauen", value: 2 },
      { label: "Ich will mehr Freiheit & Ortsunabhängigkeit", value: 1 },
      { label: "Ich will einfach mal reinschauen", value: 0 },
    ],
  },
  {
    id: "commitment",
    question: "Wie viel Zeit kannst du in den nächsten Wochen investieren?",
    options: [
      { label: "2+ Stunden täglich", value: 3 },
      { label: "1–2 Stunden täglich", value: 2 },
      { label: "Unregelmäßig", value: 1 },
      { label: "Kaum Zeit", value: 0 },
    ],
  },
  {
    id: "ownership",
    question: "Was beschreibt deine Arbeitsweise am besten?",
    options: [
      { label: "Ich übernehme Verantwortung und ziehe durch", value: 3 },
      { label: "Ich brauche noch Orientierung", value: 2 },
      { label: "Ich bin unsicher", value: 1 },
      { label: "Ich teste nur", value: 0 },
    ],
  },
  {
    id: "situation",
    question: "Was beschreibt deine aktuelle Situation am besten?",
    options: [
      { label: "Ich will mir etwas Starkes aufbauen", value: 2 },
      { label: "Ich will aus meinem Job raus", value: 2 },
      { label: "Ich brauche dringend Einkommen", value: 3 },
      { label: "Ich suche nur nach Möglichkeiten", value: 0 },
    ],
  },
  {
    id: "urgency",
    question: "Wie dringend ist es für dich, jetzt zu starten?",
    options: [
      { label: "Sehr dringend (ich muss handeln)", value: 3 },
      { label: "Wichtig, aber nicht dringend", value: 2 },
      { label: "Eher optional", value: 0 },
    ],
  },
];

/**
 * Question-set selector. Keeps the positional contract of
 * `calculateQualification` intact — the masterclass set must always reduce to
 * the same `[situation, commitment, urgency, ownership, intent]` value tuple.
 */
export function getQuestionsForIntent(
  intent: "masterclass" | "default" | null | undefined,
): QualificationQuestion[] {
  return intent === "masterclass"
    ? QUALIFICATION_QUESTIONS_MASTERCLASS
    : QUALIFICATION_QUESTIONS;
}

export interface QualificationResult {
  score: number;
  bucket: "high" | "mid" | "low";
  path: "direct_closer" | "setter_flow" | "no_call";
  answers: Record<string, number>;
}

/**
 * Calculate qualification score from raw answer values.
 *
 * Formula:
 *   score = urgency×3 + commitment×3 + ownership×2 + intent×2
 *
 * `situation` is stored for segmentation but NOT in the weighted formula.
 *
 * Pass `questions` together with `answerValues` (same length, same order) so
 * any reordered question set — e.g. the masterclass variant — still maps
 * answers to the right semantic IDs. Without `questions`, the legacy default
 * order `[situation, commitment, urgency, ownership, intent]` is assumed.
 */
export function calculateQualification(
  answerValues: number[],
  questions?: QualificationQuestion[],
): QualificationResult {
  const ids = questions?.length === answerValues.length
    ? questions.map((q) => q.id)
    : ["situation", "commitment", "urgency", "ownership", "intent"];

  const byId: Record<string, number> = {
    situation: 0,
    commitment: 0,
    urgency: 0,
    ownership: 0,
    intent: 0,
  };
  ids.forEach((id, i) => {
    byId[id] = answerValues[i] ?? 0;
  });

  const score =
    byId.urgency * 3 +
    byId.commitment * 3 +
    byId.ownership * 2 +
    byId.intent * 2;

  const bucket: QualificationResult["bucket"] =
    score >= 8 ? "high" : score >= 5 ? "mid" : "low";

  const path: QualificationResult["path"] =
    bucket === "high"
      ? "direct_closer"
      : bucket === "mid"
        ? "setter_flow"
        : "no_call";

  return { score, bucket, path, answers: byId };
}

