/**
 * Fast Track Self-Qualification Engine
 * Score 0–100 for self-closing eligibility.
 */

export interface FastTrackQuestion {
  id: string;
  question: string;
  options: { label: string; score: number }[];
}

export const FAST_TRACK_QUESTIONS: FastTrackQuestion[] = [
  {
    id: "speed",
    question: "Wie schnell willst du starten?",
    options: [
      { label: "Sofort — ich bin bereit", score: 20 },
      { label: "Diese Woche", score: 15 },
      { label: "Irgendwann demnächst", score: 5 },
      { label: "Ich schau erst mal", score: 0 },
    ],
  },
  {
    id: "income_urgency",
    question: "Wie wichtig ist dir Einkommen kurzfristig?",
    options: [
      { label: "Sehr wichtig — ich brauche einen Weg", score: 20 },
      { label: "Wichtig, aber nicht überlebenswichtig", score: 14 },
      { label: "Wäre schön, aber kein Muss", score: 5 },
      { label: "Spielt gerade keine Rolle", score: 0 },
    ],
  },
  {
    id: "time",
    question: "Wie viele Stunden pro Woche kannst du investieren?",
    options: [
      { label: "10+ Stunden", score: 20 },
      { label: "5–10 Stunden", score: 14 },
      { label: "2–5 Stunden", score: 7 },
      { label: "Weniger als 2 Stunden", score: 0 },
    ],
  },
  {
    id: "clarity",
    question: "Warum willst du Closing lernen?",
    options: [
      { label: "Ich will einen klaren Weg zu Einkommen", score: 20 },
      { label: "Ich will einen High-Income Skill aufbauen", score: 16 },
      { label: "Ich suche nach Möglichkeiten", score: 6 },
      { label: "Bin neugierig", score: 0 },
    ],
  },
  {
    id: "investment",
    question: "Wie stehst du zu Weiterbildung & Investition in dich selbst?",
    options: [
      { label: "Ich investiere, wenn das System stimmt", score: 20 },
      { label: "Ich bin offen, muss aber überzeugt werden", score: 12 },
      { label: "Ich suche kostenlose Wege", score: 3 },
      { label: "Investition ist gerade nicht möglich", score: 0 },
    ],
  },
];

export type FastTrackBucket = "high" | "mid" | "low";

export interface FastTrackResult {
  score: number;
  bucket: FastTrackBucket;
  answers: Record<string, number>;
}

export function calculateFastTrackScore(answerScores: number[]): FastTrackResult {
  const score = answerScores.reduce((a, b) => a + b, 0);

  const bucket: FastTrackBucket =
    score > 75 ? "high" : score >= 50 ? "mid" : "low";

  const answers: Record<string, number> = {};
  FAST_TRACK_QUESTIONS.forEach((q, i) => {
    answers[q.id] = answerScores[i] ?? 0;
  });

  return { score, bucket, answers };
}
