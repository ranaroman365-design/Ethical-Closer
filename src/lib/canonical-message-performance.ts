/**
 * Layer 32 — Message Performance System (Canon)
 * ------------------------------------------------------------------
 * Tracking, A/B-Auswertung und (manuelle/auto) Variant-Promotion
 * für Templates aus Layer 31 (message_library).
 *
 * Strikt additiv. Schreibt nur, wenn enabled=true (Server-side Gate).
 * Auto-Promotion nur wenn auto_promote_enabled=true.
 *
 * Source of Truth = DB:
 *   - message_performance_settings (singleton)
 *   - message_performance_events    (raw, append-only)
 *   - message_stats                 (aggregated, generated rates)
 *   - message_ab_decisions          (audit log)
 *
 * RPCs:
 *   record_message_event(...)
 *   attribute_conversion_to_message(lead, revenue, funnel?)
 *   refresh_message_stats()
 *   evaluate_ab_significance(template_key)
 *   apply_ab_winner(template_key, winner, type, reason?)
 */

export const PERFORMANCE_EVENT_TYPES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "converted",
  "bounced",
  "failed",
  "suppressed",
] as const;

export type PerformanceEventType = (typeof PERFORMANCE_EVENT_TYPES)[number];

export const PRIMARY_KPIS = [
  "delivery_rate",
  "open_rate",
  "click_rate",
  "reply_rate",
  "conversion_rate",
] as const;

export const REVENUE_KPIS = [
  "revenue_total",
  "revenue_per_message",
  "converted_count",
] as const;

export interface MessageStatsRow {
  template_key: string;
  variant_key: string;
  funnel_id: string | null;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  replied_count: number;
  converted_count: number;
  revenue_total: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  conversion_rate: number;
  revenue_per_message: number;
  last_recomputed_at: string;
}

export interface AbEvaluation {
  template_key: string;
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

/** Decide whether auto-promotion should fire for an evaluation. */
export function shouldAutoPromote(
  evalRow: AbEvaluation,
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

/** Format conversion rate as a human-readable percentage. */
export function fmtRate(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtRevenue(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "€0";
  return `€${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 0 })}`;
}

export const LAYER_32 = {
  id: 32,
  name: "Message Performance System",
  block: "Intelligence",
  depends_on: [31, 12],
  silent_until_opt_in: true,
} as const;
