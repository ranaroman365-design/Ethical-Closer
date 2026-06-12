/**
 * Confidence Engine — additive Layer 49+ analytics
 * ──────────────────────────────────────────────────────────────────────────
 * Pure functions. No DB access, no side effects. Used by:
 *   • supabase/functions/ab-confidence-engine (server-side scoring + DB write)
 *   • src/components/admin/ConfidenceEnginePanels (client-side rendering)
 *
 * Does NOT replace the Winner Engine, Auto-Reweighting, or Attribution layer.
 * Reads their outputs and produces:
 *   • confidence_score   (0–100)
 *   • confidence_level   (very_low | low | medium | high | very_high)
 *   • confidence_reason  (string[])
 *   • winner_status      (none | potential | winner | confirmed)
 *   • experiment_health  (0–100, meta-score)
 *   • variance_indicator (0–1, higher = more unstable)
 *   • coverage_impact    (0–1, penalty from low attribution coverage)
 *   • shift_allowed      (boolean — traffic shift guard)
 *
 * Anti-false-positive guarantees:
 *   1. Confidence rises with data volume.
 *   2. Confidence drops when attribution coverage is low.
 *   3. Confidence drops when conversion-rate variance is high.
 *   4. shift_allowed requires confidence ≥ 90 AND coverage ≥ 95% AND min data.
 *   5. confirmed winners require confidence ≥ 95 AND ≥ minimum business conv.
 */

export type ConfidenceLevel = "very_low" | "low" | "medium" | "high" | "very_high";
export type WinnerStatus = "none" | "potential" | "winner" | "confirmed";

export interface VariantStats {
  variant: string;
  exposures: number;
  quiz_started: number;
  quiz_completed: number;
  leads: number;
  hql: number;
  bookings: number;
  showups?: number;
  /** Existing Winner Engine score (untouched, read-only input). */
  score: number;
  /** Existing Winner Engine flag (untouched). */
  is_winner: boolean;
  /** Recent per-day conversion rates (lead/exposure) used for variance check. */
  daily_lead_rates?: number[];
}

export interface ConfidenceInputs {
  variants: VariantStats[];
  /** Global attribution coverage (0–1) — from ab-experiment-audit. */
  attribution_coverage: number;
}

export interface ConfidenceResult {
  variant: string;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  confidence_reason: string[];
  winner_status: WinnerStatus;
  variance_indicator: number;
  coverage_impact: number;
  shift_allowed: boolean;
}

export interface ExperimentHealth {
  experiment_health: number;
  coverage: number;
  sample_size_score: number;
  confidence_avg: number;
  stability: number;
  tracking_quality: number;
}

// ─── Thresholds (conservative) ─────────────────────────────────────────────
export const MIN_EXPOSURES_POTENTIAL = 100;
export const MIN_EXPOSURES_WINNER = 400;
export const MIN_LEADS_WINNER = 20;
export const MIN_BOOKINGS_CONFIRMED = 5;
export const MIN_CONFIDENCE_FOR_SHIFT = 90;
export const MIN_COVERAGE_FOR_SHIFT = 0.95;
export const MIN_CONFIDENCE_FOR_CONFIRMED = 95;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 96) return "very_high";
  if (score >= 86) return "high";
  if (score >= 71) return "medium";
  if (score >= 51) return "low";
  return "very_low";
}

/** Wilson lower bound (95%) for binomial proportion. */
function wilsonLower(successes: number, n: number): number {
  if (n <= 0) return 0;
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

/** Variance of an array of rates → normalised 0..1 instability indicator. */
function rateVariance(rates: number[]): number {
  if (!rates || rates.length < 2) return 0;
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  if (mean <= 0) return 0;
  const variance =
    rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return Math.min(1, cv); // 1 = very unstable
}

/**
 * Compute confidence for a single variant, given its peers + global coverage.
 */
export function computeVariantConfidence(
  v: VariantStats,
  peers: VariantStats[],
  coverage: number,
): ConfidenceResult {
  const reasons: string[] = [];

  // ─── 1. Sample-size component (0–35) ────────────────────────────────────
  const exposureScore = Math.min(35, (v.exposures / MIN_EXPOSURES_WINNER) * 35);
  if (v.exposures < MIN_EXPOSURES_POTENTIAL) {
    reasons.push(`Nur ${v.exposures} Exposures — zu wenig für Aussage`);
  } else if (v.exposures >= MIN_EXPOSURES_WINNER) {
    reasons.push("Hohes Exposure-Volumen");
  }

  // ─── 2. Business-data depth (0–30) ──────────────────────────────────────
  const leadScore = Math.min(15, (v.leads / MIN_LEADS_WINNER) * 15);
  const bookingScore = Math.min(15, (v.bookings / MIN_BOOKINGS_CONFIRMED) * 15);
  if (v.leads < MIN_LEADS_WINNER) reasons.push(`Lead-Daten knapp (${v.leads}/${MIN_LEADS_WINNER})`);
  else reasons.push("Lead-Daten ausreichend");
  if (v.bookings < MIN_BOOKINGS_CONFIRMED) reasons.push(`Booking-Daten noch nicht ausreichend (${v.bookings})`);
  else reasons.push("Booking-Daten solide");

  // ─── 3. Wilson lower-bound vs. peers (0–20) ─────────────────────────────
  const myLower = wilsonLower(v.leads, Math.max(1, v.exposures));
  const peerLowers = peers
    .filter((p) => p.variant !== v.variant)
    .map((p) => wilsonLower(p.leads, Math.max(1, p.exposures)));
  const bestPeerLower = peerLowers.length ? Math.max(...peerLowers) : 0;
  const separation = Math.max(0, myLower - bestPeerLower); // > 0 = beating peers
  const separationScore = Math.min(20, separation * 200);
  if (separation > 0.005) reasons.push("Wilson-Untergrenze schlägt Peers");

  // ─── 4. Coverage component (0–15) — penalises low attribution ───────────
  const coverageScore = clamp(coverage * 15, 0, 15);
  const coverage_impact = Math.max(0, 1 - coverage);
  if (coverage < 0.9) reasons.push(`Attribution Coverage nur ${(coverage * 100).toFixed(0)}%`);

  // ─── 5. Variance penalty ────────────────────────────────────────────────
  const variance_indicator = rateVariance(v.daily_lead_rates ?? []);
  const variancePenalty = variance_indicator * 20; // up to -20
  if (variance_indicator > 0.4) reasons.push("Hohe Schwankung der Conversion-Rate");

  // ─── Final score ────────────────────────────────────────────────────────
  let score = exposureScore + leadScore + bookingScore + separationScore + coverageScore;
  score -= variancePenalty;
  score = clamp(score, 0, 100);

  const level = levelFromScore(score);

  // ─── Winner status ──────────────────────────────────────────────────────
  let winner_status: WinnerStatus = "none";
  const isLeader = v.is_winner || v.score === Math.max(...peers.map((p) => p.score));
  if (isLeader) {
    if (
      score >= MIN_CONFIDENCE_FOR_CONFIRMED &&
      v.bookings >= MIN_BOOKINGS_CONFIRMED &&
      v.leads >= MIN_LEADS_WINNER &&
      coverage >= MIN_COVERAGE_FOR_SHIFT
    ) {
      winner_status = "confirmed";
    } else if (score >= MIN_CONFIDENCE_FOR_SHIFT && v.leads >= MIN_LEADS_WINNER) {
      winner_status = "winner";
    } else if (v.exposures >= MIN_EXPOSURES_POTENTIAL && separation > 0) {
      winner_status = "potential";
    }
  }

  // ─── Shift guard ────────────────────────────────────────────────────────
  const shift_allowed =
    score >= MIN_CONFIDENCE_FOR_SHIFT &&
    coverage >= MIN_COVERAGE_FOR_SHIFT &&
    v.leads >= MIN_LEADS_WINNER &&
    v.exposures >= MIN_EXPOSURES_WINNER &&
    variance_indicator < 0.5;

  return {
    variant: v.variant,
    confidence_score: Math.round(score * 10) / 10,
    confidence_level: level,
    confidence_reason: reasons,
    winner_status,
    variance_indicator: Math.round(variance_indicator * 1000) / 1000,
    coverage_impact: Math.round(coverage_impact * 1000) / 1000,
    shift_allowed,
  };
}

/**
 * Compute the meta Experiment Health Score (0–100) for an entire slot.
 */
export function computeExperimentHealth(
  results: ConfidenceResult[],
  variants: VariantStats[],
  coverage: number,
): ExperimentHealth {
  const totalExposures = variants.reduce((s, v) => s + v.exposures, 0);
  const totalLeads = variants.reduce((s, v) => s + v.leads, 0);
  const totalBookings = variants.reduce((s, v) => s + v.bookings, 0);

  const sample_size_score = clamp(
    (totalExposures / (MIN_EXPOSURES_WINNER * Math.max(1, variants.length))) * 100,
    0,
    100,
  );
  const confidence_avg = results.length
    ? results.reduce((s, r) => s + r.confidence_score, 0) / results.length
    : 0;
  const avgVariance = results.length
    ? results.reduce((s, r) => s + r.variance_indicator, 0) / results.length
    : 0;
  const stability = clamp((1 - avgVariance) * 100, 0, 100);
  const tracking_quality = clamp(coverage * 100, 0, 100);

  // Weighted meta: coverage 30 · sample 20 · confidence 25 · stability 15 · tracking 10
  const experiment_health =
    coverage * 30 +
    (sample_size_score / 100) * 20 +
    (confidence_avg / 100) * 25 +
    (stability / 100) * 15 +
    (tracking_quality / 100) * 10;

  // Bonus penalty: zero downstream data caps health
  let health = experiment_health;
  if (totalLeads === 0) health = Math.min(health, 30);
  if (totalBookings === 0) health = Math.min(health, 60);

  return {
    experiment_health: Math.round(health * 10) / 10,
    coverage,
    sample_size_score: Math.round(sample_size_score * 10) / 10,
    confidence_avg: Math.round(confidence_avg * 10) / 10,
    stability: Math.round(stability * 10) / 10,
    tracking_quality: Math.round(tracking_quality * 10) / 10,
  };
}

export const CONFIDENCE_LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  very_low: "Very Low",
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very High",
};

export const WINNER_STATUS_LABEL: Record<WinnerStatus, string> = {
  none: "—",
  potential: "Potential Winner",
  winner: "Winner",
  confirmed: "Confirmed Winner",
};
