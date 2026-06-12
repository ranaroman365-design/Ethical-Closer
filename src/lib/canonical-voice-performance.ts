/**
 * Layer 33 — Voice Performance System (Canon)
 * ------------------------------------------------------------------
 * Voice-Pendant zu Layer 32 (Message Performance).
 * Tracking, Script-A/B, Auto-Promotion für Calls.
 *
 * Strikt additiv. Schreibt nur, wenn enabled=true.
 * AI-Auto-Analyse standardmäßig OFF (ai_analysis_enabled=false).
 *
 * Source of Truth = DB:
 *   - call_performance_settings (singleton)
 *   - call_performance_events    (raw funnel events)
 *   - call_intent_analysis       (intent/objection/sentiment per call)
 *   - call_script_variants       (script registry, variant_weight)
 *   - call_stats                 (aggregated, generated rates)
 *   - call_objection_stats       (heatmap)
 *   - call_ab_decisions          (audit log)
 *
 * RPCs:
 *   record_call_event(call_id, event_type, …)
 *   record_call_intent(call_id, intent?, objection?, sentiment?, ...)
 *   refresh_call_stats()
 *   evaluate_call_ab_significance(script_key)
 *   apply_call_ab_winner(script_key, winner, type, reason?)
 *
 * Coexistence:
 *   - call_analysis (existing) = Closer-AI-Copilot coaching scores. Untouched.
 *   - call_intent_analysis (new) = Voice-Performance intent/objection layer.
 *   - calls table (Economic Truth System) = Revenue SoT. Untouched.
 */

export const CALL_FUNNEL_EVENT_TYPES = [
  "dialed",
  "answered",
  "engaged",
  "qualified",
  "booked",
  "showed",
  "closed",
  "no_answer",
  "hangup",
  "voicemail",
  "failed",
] as const;

export type CallEventType = (typeof CALL_FUNNEL_EVENT_TYPES)[number];

export const CALL_SOURCE = ["ai_setter", "human", "hybrid"] as const;
export type CallSource = (typeof CALL_SOURCE)[number];

export const SENTIMENT = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof SENTIMENT)[number];

/** Canonical objection types — used for heatmap consistency. */
export const OBJECTION_TYPES = [
  "no_time",
  "no_money",
  "need_to_think",
  "not_interested",
  "call_later",
  "spouse_decision",
  "wrong_number",
  "already_using_competitor",
  "other",
] as const;
export type ObjectionType = (typeof OBJECTION_TYPES)[number];

/** Canonical intents the AI Setter / human operator can tag. */
export const INTENTS = [
  "info_request",
  "ready_to_book",
  "needs_qualification",
  "not_a_fit",
  "needs_followup",
  "objection",
  "callback_requested",
] as const;

export const VOICE_CORE_KPIS = [
  "answer_rate",
  "engagement_rate",
  "qualification_rate",
  "booking_rate",
] as const;

export const VOICE_REVENUE_KPIS = [
  "show_rate_after_call",
  "close_rate_after_call",
  "revenue_per_call",
  "revenue_per_answered_call",
] as const;

export const VOICE_BEHAVIORAL_KPIS = [
  "avg_duration_seconds",
  "hangup_count",
  "no_answer_count",
] as const;

export interface CallStatsRow {
  script_key: string;
  variant_key: string;
  funnel_id: string | null;
  dialed_count: number;
  answered_count: number;
  engaged_count: number;
  qualified_count: number;
  booked_count: number;
  showed_count: number;
  closed_count: number;
  hangup_count: number;
  no_answer_count: number;
  total_duration_seconds: number;
  revenue_total: number;
  answer_rate: number;
  engagement_rate: number;
  qualification_rate: number;
  booking_rate: number;
  show_rate_after_call: number;
  close_rate_after_call: number;
  avg_duration_seconds: number;
  revenue_per_call: number;
  revenue_per_answered_call: number;
  last_recomputed_at: string;
}

export interface CallAbEvaluation {
  script_key: string;
  winner_variant: string;
  loser_variant: string;
  winner_rate: number;
  loser_rate: number;
  lift: number | null;
  z_score: number;
  approx_p_value: number;
  total_sample: number;
  is_significant: boolean;
}

export interface ObjectionStat {
  script_key: string;
  variant_key: string;
  objection_type: string;
  occurrences: number;
  share_pct: number;
}

export function shouldAutoPromoteCall(
  evalRow: CallAbEvaluation,
  autoPromoteEnabled: boolean,
  pThreshold = 0.05,
  minSample = 100,
): boolean {
  if (!autoPromoteEnabled) return false;
  if (!evalRow.is_significant) return false;
  if (evalRow.total_sample < minSample) return false;
  if (evalRow.approx_p_value > pThreshold) return false;
  if (evalRow.winner_rate <= evalRow.loser_rate) return false;
  return true;
}

export function fmtRate(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtRevenue(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "€0";
  return `€${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 })}`;
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export const LAYER_33 = {
  id: 33,
  name: "Voice Performance System",
  block: "Intelligence",
  depends_on: [28, 32, 12],
  silent_until_opt_in: true,
} as const;
