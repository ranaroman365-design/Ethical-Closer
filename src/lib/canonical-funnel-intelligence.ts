/**
 * LAYER 34 — Full Funnel Intelligence Dashboard™ (Canon)
 * Block: Intelligence (primary) + Governance
 *
 * Aggregations-Layer für CEO-Master-View über den gesamten Funnel.
 * Liest aus L32 (message_stats), L33 (call_stats), calls, leads.
 * Deterministische Insight Engine — keine AI in Phase 1.
 *
 * Single source of truth für: funnel_intelligence_view RPC consumers.
 */

export const CANON_LAYER_34 = {
  layer: 34,
  name: "Full Funnel Intelligence Dashboard",
  block: "Intelligence",
  status: "active",
  silent_by_default: true,
} as const;

export type FunnelSeverity = "info" | "warning" | "critical";
export type FunnelBottleneck =
  | "setter"
  | "attendance"
  | "closer"
  | "messaging"
  | "voice"
  | "lead_quality";

export type FunnelRole = "admin" | "director" | "operator";

export interface FunnelTopKpis {
  leads: number;
  bookings: number;
  shows: number;
  closes: number;
  revenue_cents: number;
  lead_to_book: number;
  book_to_show: number;
  show_to_close: number;
  revenue_per_lead_cents: number;
}

export interface FunnelDailyPoint {
  date: string;
  leads: number;
  bookings: number;
  shows: number;
  closes: number;
  revenue_cents: number;
}

export interface InsightFinding {
  id: string;
  finding_key: string;
  scope: string;
  scope_id: string;
  severity: FunnelSeverity;
  bottleneck: FunnelBottleneck | string;
  observed_value: number | null;
  threshold_value: number | null;
  message_de: string;
  message_en: string;
  recommendation: string | null;
  estimated_revenue_loss_cents: number | null;
  detected_at: string;
  resolved_at: string | null;
}

export interface FunnelIntelligencePayload {
  window_days: number;
  role: FunnelRole;
  top_kpis: FunnelTopKpis;
  daily: FunnelDailyPoint[];
  findings: InsightFinding[];
  generated_at: string;
}

/** Default deterministic thresholds — mirror DB defaults. */
export const FUNNEL_THRESHOLDS = {
  show_rate_min: 40,
  close_rate_min: 15,
  lead_to_book_min: 20,
  revenue_per_lead_cents_min: 5000,
} as const;

/** Format cents → € with locale. */
export function formatEur(cents: number, locale: "de" | "en" = "de"): string {
  const eur = (cents ?? 0) / 100;
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);
}

export function severityRank(s: FunnelSeverity): number {
  if (s === "critical") return 0;
  if (s === "warning") return 1;
  return 2;
}
