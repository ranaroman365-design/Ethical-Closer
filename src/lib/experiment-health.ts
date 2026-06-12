/**
 * Layer 49 — Experimentation OS: Health & Recommendation Engine
 *
 * Pure functions. No DB access, no side effects. Operates on already-aggregated
 * variant stats so it can be used both in the dashboard and (later) in scheduled jobs.
 *
 * CONSERVATIVE thresholds — we'd rather under-call winners than auto-ship a regression.
 */

export type ConfidenceStatus =
  | "insufficient_data"
  | "insufficient_downstream_data"
  | "directional_signal"
  | "strong_signal"
  | "winner_ready"
  | "inconclusive"
  | "possible_harm";

export type Recommendation =
  | "keep_running"
  | "declare_winner"
  | "stop_losing_variant"
  | "extend_test"
  | "archive_inconclusive"
  | "create_next_iteration"
  | "insufficient_downstream_data";

export interface VariantStatInput {
  variant_key: string;
  is_control: boolean;
  is_holdout: boolean;
  weight_pct: number | null;
  exposures: number;
  primary_conversions: number; // bookings (or whatever maps to primary_kpi)
  secondary_conversions?: number; // quiz_completes etc.
}

export interface VariantHealth extends VariantStatInput {
  primary_cr: number | null; // 0..1
  secondary_cr: number | null;
  lift_vs_control_pct: number | null;
  exposure_share_pct: number;
  exposure_balance_delta_pct: number | null; // actual - intended
  is_possible_harm: boolean;
}

export interface ExperimentHealth {
  total_exposures: number;
  variants: VariantHealth[];
  control_key: string | null;
  best_challenger_key: string | null;
  best_lift_pct: number | null;
  worst_lift_pct: number | null;
  confidence: ConfidenceStatus;
  recommendation: Recommendation;
  reason: string;
  warnings: string[];
}

// Conservative thresholds (per acceptance criteria)
export const MIN_EXPOSURES_DIRECTIONAL = 100;
export const MIN_EXPOSURES_WINNER = 300;
export const MIN_LIFT_FOR_WINNER_PCT = 10; // +10% relative
export const HARM_THRESHOLD_PCT = -10; // worse than control by >10%

export function computeExperimentHealth(variants: VariantStatInput[]): ExperimentHealth {
  const total = variants.reduce((s, v) => s + v.exposures, 0);
  const control = variants.find((v) => v.is_control) ?? null;
  const ctrlCr =
    control && control.exposures > 0 ? control.primary_conversions / control.exposures : null;

  const enriched: VariantHealth[] = variants.map((v) => {
    const cr = v.exposures > 0 ? v.primary_conversions / v.exposures : null;
    const sCr =
      v.secondary_conversions !== undefined && v.exposures > 0
        ? v.secondary_conversions / v.exposures
        : null;
    const lift =
      cr !== null && ctrlCr !== null && ctrlCr > 0 && !v.is_control
        ? ((cr - ctrlCr) / ctrlCr) * 100
        : null;
    const sharePct = total > 0 ? (v.exposures / total) * 100 : 0;
    const balanceDelta = v.weight_pct != null ? sharePct - v.weight_pct : null;
    const isHarm =
      lift !== null &&
      lift <= HARM_THRESHOLD_PCT &&
      v.exposures >= MIN_EXPOSURES_DIRECTIONAL;
    return {
      ...v,
      primary_cr: cr,
      secondary_cr: sCr,
      lift_vs_control_pct: lift,
      exposure_share_pct: sharePct,
      exposure_balance_delta_pct: balanceDelta,
      is_possible_harm: isHarm,
    };
  });

  const challengers = enriched.filter((v) => !v.is_control && !v.is_holdout);
  const withLift = challengers.filter((v) => v.lift_vs_control_pct !== null);
  const best =
    withLift.length > 0
      ? withLift.reduce((a, b) =>
          (a.lift_vs_control_pct ?? -Infinity) >= (b.lift_vs_control_pct ?? -Infinity) ? a : b,
        )
      : null;
  const worst =
    withLift.length > 0
      ? withLift.reduce((a, b) =>
          (a.lift_vs_control_pct ?? Infinity) <= (b.lift_vs_control_pct ?? Infinity) ? a : b,
        )
      : null;

  const minActiveExposures = Math.min(
    ...enriched.filter((v) => !v.is_holdout).map((v) => v.exposures),
    Infinity,
  );
  const harmful = enriched.filter((v) => v.is_possible_harm);

  // ---- Confidence classification ----
  let confidence: ConfidenceStatus;
  if (harmful.length > 0) {
    confidence = "possible_harm";
  } else if (!isFinite(minActiveExposures) || minActiveExposures < MIN_EXPOSURES_DIRECTIONAL) {
    confidence = "insufficient_data";
  } else if (
    best &&
    best.lift_vs_control_pct !== null &&
    best.lift_vs_control_pct >= MIN_LIFT_FOR_WINNER_PCT &&
    best.exposures >= MIN_EXPOSURES_WINNER &&
    (control?.exposures ?? 0) >= MIN_EXPOSURES_WINNER
  ) {
    confidence = "winner_ready";
  } else if (minActiveExposures >= MIN_EXPOSURES_WINNER) {
    confidence = best && best.lift_vs_control_pct !== null && Math.abs(best.lift_vs_control_pct) < 3
      ? "inconclusive"
      : "directional_signal";
  } else {
    confidence = "directional_signal";
  }
  if (
    confidence === "directional_signal" &&
    best &&
    best.lift_vs_control_pct !== null &&
    Math.abs(best.lift_vs_control_pct) >= MIN_LIFT_FOR_WINNER_PCT
  ) {
    confidence = "strong_signal";
  }

  // ---- Recommendation ----
  let recommendation: Recommendation;
  let reason: string;
  const warnings: string[] = [];

  if (harmful.length > 0) {
    recommendation = "stop_losing_variant";
    reason = `${harmful.length} variant(s) underperform control by ≥10%. Stop them to protect conversion.`;
  } else if (confidence === "winner_ready") {
    // Final guardrail: even if confidence says winner-ready, refuse to declare
    // a winner unless the primary metric actually has data on BOTH arms.
    const winnerHasPrimary = (best?.primary_conversions ?? 0) > 0;
    const controlHasPrimary = (control?.primary_conversions ?? 0) > 0;
    if (!winnerHasPrimary || !controlHasPrimary) {
      confidence = "insufficient_downstream_data";
      recommendation = "insufficient_downstream_data";
      reason =
        "Primary metric (e.g. bookings) has no attributable conversions on at least one arm — keep collecting before declaring a winner. This often means downstream events (booking_created) aren't tagged with ab_test/ab_variant.";
    } else {
      recommendation = "declare_winner";
      reason = `${best?.variant_key} shows +${best?.lift_vs_control_pct?.toFixed(1)}% lift with ≥${MIN_EXPOSURES_WINNER} exposures per arm. Safe to declare.`;
    }
  } else if (confidence === "insufficient_data") {
    recommendation = "keep_running";
    reason = `Need ≥${MIN_EXPOSURES_DIRECTIONAL} exposures per active variant. Lowest is ${isFinite(minActiveExposures) ? minActiveExposures : 0}.`;
  } else if (confidence === "inconclusive") {
    recommendation = "archive_inconclusive";
    reason = "Sample is large but no variant separates from control. Archive and design a stronger hypothesis.";
  } else if (confidence === "strong_signal") {
    recommendation = "extend_test";
    reason = `${best?.variant_key} trending +${best?.lift_vs_control_pct?.toFixed(1)}%. Extend until ≥${MIN_EXPOSURES_WINNER} exposures per arm to confirm.`;
  } else {
    recommendation = "keep_running";
    reason = "Directional signal — keep collecting data.";
  }

  // Balance warnings
  enriched.forEach((v) => {
    if (
      v.exposure_balance_delta_pct !== null &&
      Math.abs(v.exposure_balance_delta_pct) > 15
    ) {
      warnings.push(
        `Variant ${v.variant_key}: exposure ${v.exposure_share_pct.toFixed(0)}% vs intended ${v.weight_pct}% (${v.exposure_balance_delta_pct > 0 ? "+" : ""}${v.exposure_balance_delta_pct.toFixed(0)}%).`,
      );
    }
  });
  if (control && (control.exposures ?? 0) < MIN_EXPOSURES_DIRECTIONAL) {
    warnings.push("Control sample is thin — lifts may be unstable.");
  }
  if (recommendation === "declare_winner" && total < 600) {
    warnings.push("Downstream booking volume is still low — verify no harm to deeper funnel before rollout.");
  }

  return {
    total_exposures: total,
    variants: enriched,
    control_key: control?.variant_key ?? null,
    best_challenger_key: best?.variant_key ?? null,
    best_lift_pct: best?.lift_vs_control_pct ?? null,
    worst_lift_pct: worst?.lift_vs_control_pct ?? null,
    confidence,
    recommendation,
    reason,
    warnings,
  };
}

export const CONFIDENCE_LABEL: Record<ConfidenceStatus, string> = {
  insufficient_data: "Insufficient data",
  insufficient_downstream_data: "Insufficient downstream data",
  directional_signal: "Directional signal",
  strong_signal: "Strong signal",
  winner_ready: "Winner-ready",
  inconclusive: "Inconclusive",
  possible_harm: "Possible harm",
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  keep_running: "Keep running",
  declare_winner: "Declare winner",
  stop_losing_variant: "Stop losing variant",
  extend_test: "Extend test",
  archive_inconclusive: "Archive — inconclusive",
  create_next_iteration: "Create next iteration",
  insufficient_downstream_data: "Insufficient downstream data",
};

export function confidenceBadgeVariant(c: ConfidenceStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (c) {
    case "winner_ready":
    case "strong_signal":
      return "default";
    case "possible_harm":
      return "destructive";
    case "inconclusive":
    case "insufficient_data":
      return "secondary";
    default:
      return "outline";
  }
}
