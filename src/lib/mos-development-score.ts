/**
 * MasterOfSales — Indirect Development & Placement Intent Scores.
 *
 * NEVER asks investment readiness directly. Derives two complementary
 * 0–100 scores from priorities, learning orientation, ownership, and
 * placement-focus signals.
 *
 * Used ONLY on the MOS quiz path (`source=masterofsales*`). Output is
 * consumed exclusively by the MOS avatar-filter interstitial — does not
 * affect existing scoring/routing of any other funnel.
 */

export type QualificationCluster =
  | "new_starter"
  | "experienced_growth"
  | "trained_underperformer"
  | "job_seeker"
  | "client_seeker";

export const CLUSTER_LABELS: Record<QualificationCluster, string> = {
  new_starter:
    "Ich starte neu und möchte Closing/Setting professionell lernen",
  experienced_growth:
    "Ich habe erste Erfahrung und möchte mich weiterentwickeln",
  trained_underperformer:
    "Ich habe bereits eine Ausbildung abgeschlossen, aber es läuft noch nicht wie gewünscht",
  job_seeker:
    "Ich suche aktuell hauptsächlich eine Setter-/Closer-Stelle",
  client_seeker:
    "Ich habe bereits eine Ausbildung abgeschlossen und suche primär Auftraggeber oder Leads",
};

export type IndirectAnswerId =
  | "A_quick_action"
  | "A_find_gaps"
  | "A_ready_with_plan"
  | "A_direct_placement"
  | "B_quick_experience"
  | "B_improve_skills"
  | "B_long_term_results"
  | "B_direct_placement"
  | "C_seek_placement"
  | "C_work_on_gaps"
  | "C_use_support"
  | "C_unsure";

/** Development orientation — Lernen, Eigenverantwortung, Karrierefokus. */
const DEV_SCORE_MAP: Record<IndirectAnswerId, number> = {
  A_quick_action: 5,
  A_find_gaps: 18,
  A_ready_with_plan: 25,
  A_direct_placement: 0,

  B_quick_experience: 8,
  B_improve_skills: 22,
  B_long_term_results: 25,
  B_direct_placement: 0,

  C_seek_placement: 0,
  C_work_on_gaps: 22,
  C_use_support: 25,
  C_unsure: 10,
};

/** Placement intent — Jobsuche, Auftraggebersuche, Sofort-Einkommens-Fokus. */
const PLACEMENT_INTENT_MAP: Record<IndirectAnswerId, number> = {
  A_quick_action: 12,
  A_find_gaps: 2,
  A_ready_with_plan: 0,
  A_direct_placement: 25,

  B_quick_experience: 10,
  B_improve_skills: 0,
  B_long_term_results: 0,
  B_direct_placement: 25,

  C_seek_placement: 25,
  C_work_on_gaps: 0,
  C_use_support: 3,
  C_unsure: 8,
};

/** Cluster contribution to placement intent (additive, capped 0–25). */
const CLUSTER_PLACEMENT_BIAS: Record<QualificationCluster, number> = {
  new_starter: 0,
  experienced_growth: 0,
  trained_underperformer: 5,
  job_seeker: 25,
  client_seeker: 25,
};

export interface IndirectAnswers {
  A?: IndirectAnswerId;
  B?: IndirectAnswerId;
  C?: IndirectAnswerId;
}

function answeredIds(a: IndirectAnswers): IndirectAnswerId[] {
  return [a.A, a.B, a.C].filter((id): id is IndirectAnswerId => !!id);
}

/** 0–100 development score. */
export function computeDevelopmentScore(answers: IndirectAnswers): number {
  const sum = answeredIds(answers)
    .map((id) => DEV_SCORE_MAP[id] ?? 0)
    .reduce((a, b) => a + b, 0);
  return Math.max(0, Math.min(100, Math.round((sum / 75) * 100)));
}

/** 0–100 placement intent score (job/Auftraggeber/Sofort-Einkommen). */
export function computePlacementIntentScore(
  answers: IndirectAnswers,
  cluster: QualificationCluster | null,
): number {
  const indirectSum = answeredIds(answers)
    .map((id) => PLACEMENT_INTENT_MAP[id] ?? 0)
    .reduce((a, b) => a + b, 0);
  const clusterBias = cluster ? CLUSTER_PLACEMENT_BIAS[cluster] : 0;
  const total = indirectSum + clusterBias;
  // Max possible = 75 (indirect) + 25 (cluster) = 100
  return Math.max(0, Math.min(100, Math.round(total)));
}

export const DEV_SCORE_REDIRECT_THRESHOLD = 35;
export const PLACEMENT_INTENT_REDIRECT_THRESHOLD = 60;

export type RoutingDecision =
  | { kind: "stay"; reason: string }
  | { kind: "redirect_globalcloser"; reason: string };

/**
 * GlobalCloser redirect only when ALL true:
 *   • placement_intent_score ≥ 60 (HIGH)
 *   • development_score < 35 (LOW)
 *   • MOS fit low (cluster ∈ {job_seeker, client_seeker})
 *
 * Every dev-oriented cluster (new_starter, experienced_growth,
 * trained_underperformer) ALWAYS stays in MOS, regardless of scores.
 */
export function decideMosRouting(
  cluster: QualificationCluster | null,
  indirect: IndirectAnswers,
): RoutingDecision {
  if (!cluster) return { kind: "stay", reason: "no_cluster" };

  if (
    cluster === "new_starter" ||
    cluster === "experienced_growth" ||
    cluster === "trained_underperformer"
  ) {
    return { kind: "stay", reason: `cluster_dev:${cluster}` };
  }

  const devScore = computeDevelopmentScore(indirect);
  const placementScore = computePlacementIntentScore(indirect, cluster);

  if (
    placementScore >= PLACEMENT_INTENT_REDIRECT_THRESHOLD &&
    devScore < DEV_SCORE_REDIRECT_THRESHOLD
  ) {
    return {
      kind: "redirect_globalcloser",
      reason: `placement_${placementScore}_dev_${devScore}`,
    };
  }

  return { kind: "stay", reason: `dev_${devScore}_placement_${placementScore}` };
}

export const GLOBALCLOSER_URL = "https://joinglobalcloser.com/";
