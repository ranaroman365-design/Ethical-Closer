/**
 * quiz-angle.ts — Creative ↔ Quiz Coherence Mapper (additive, read-only)
 * --------------------------------------------------------------
 * Maps the inbound UTM / creative attribution of a session to a "quiz angle"
 * (freedom · career · pain · retargeting · default). This is the foundation
 * for ad-coherent quiz routing — the bestehende Quiz bleibt vollständig
 * Control. Eine Quiz-Variante kann sich dann gezielt für einen Angle
 * registrieren (über `ab_experiments` Key `quiz_angle_<angle>`), ohne dass
 * irgendeine bestehende Quiz-, Booking-, CRM- oder Tracking-Logik berührt
 * wird.
 *
 * Pure inference function — performs no DB writes, throws nothing, falls
 * back to "default" whenever inputs are missing or ambiguous.
 */
import { getAdAttribution } from "@/lib/ad-attribution";

export type QuizAngle =
  | "freedom"      // Freiheit / Selbstbestimmung / Potenzial
  | "career"       // Karriere / Remote Sales / Entwicklung
  | "pain"         // Schmerz / Stillstand / Veränderungsdruck
  | "retargeting"  // Warm Traffic / Re-Engagement
  | "default";     // fallback — bestehendes Control-Quiz

interface AngleSignal {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ad_name?: string | null;
  adset_name?: string | null;
  creative_id?: string | null;
}

const NORM = (s: unknown): string =>
  typeof s === "string" ? s.toLowerCase().replace(/[\s_\-]+/g, "") : "";

/**
 * Keyword buckets per angle. Conservative on purpose — falls back to
 * "default" instead of guessing. Extend additively as new creatives launch.
 */
const ANGLE_KEYWORDS: Record<Exclude<QuizAngle, "default">, readonly string[]> = {
  freedom:     ["freedom", "freiheit", "selbstbestimmung", "potenzial", "potential", "lifestyle", "ortsunabhaengig", "remote"],
  career:      ["karriere", "career", "remote", "sales", "entwicklung", "skill", "newcareer", "jobchange"],
  pain:        ["pain", "schmerz", "stillstand", "unzufrieden", "stuck", "frust", "lowperformer"],
  retargeting: ["retargeting", "rtg", "warm", "remarketing", "rt"],
};

export function resolveQuizAngle(signal?: AngleSignal | null): QuizAngle {
  const src = signal ?? readAttribution();
  if (!src) return "default";

  // Retargeting wins if explicitly tagged (medium=rt, campaign contains rtg, …)
  const medium = NORM(src.utm_medium);
  if (medium === "rt" || medium === "retargeting" || medium === "remarketing") {
    return "retargeting";
  }

  // Concat searchable fields once.
  const blob = [
    src.utm_campaign, src.utm_content, src.utm_term,
    src.ad_name, src.adset_name, src.creative_id, src.utm_source,
  ].map(NORM).join("|");

  // Score angles, return the strongest hit.
  let best: QuizAngle = "default";
  let bestScore = 0;
  for (const angle of Object.keys(ANGLE_KEYWORDS) as Array<keyof typeof ANGLE_KEYWORDS>) {
    let score = 0;
    for (const kw of ANGLE_KEYWORDS[angle]) if (blob.includes(kw)) score++;
    if (score > bestScore) { best = angle; bestScore = score; }
  }
  return best;
}

function readAttribution(): AngleSignal | null {
  try {
    const a = getAdAttribution();
    if (!a) return null;
    return {
      utm_source: a.utm_source ?? null,
      utm_medium: a.utm_medium ?? null,
      utm_campaign: a.utm_campaign ?? null,
      utm_content: a.utm_content ?? null,
      utm_term: a.utm_term ?? null,
      ad_name: (a as { ad_name?: string }).ad_name ?? null,
      adset_name: (a as { adset_name?: string }).adset_name ?? null,
      creative_id: (a as { creative_id?: string }).creative_id ?? null,
    };
  } catch {
    return null;
  }
}

/** Stable experiment-key namespace for angle-routed quiz variants. */
export function quizExperimentKeyForAngle(angle: QuizAngle): string {
  return angle === "default" ? "quiz_default" : `quiz_angle_${angle}`;
}
