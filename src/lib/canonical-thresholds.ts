/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANONICAL THRESHOLD REGISTRY (Hardwired)
 * Layer 13 — Numeric Gate Governance
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for ALL numeric gates used across:
 *   - progression (level → level)
 *   - placement readiness
 *   - certification
 *   - performance / fairness caps
 *   - routing & fast-track
 *   - consistency windows
 *
 * HARD RULES:
 *   ❌ Never hardcode a numeric gate in feature code
 *   ❌ Never duplicate a threshold across modules
 *   ✅ Always import from this file
 *   ✅ Existing values are preserved — do not mutate without audit
 *
 * Sibling sources (consumers, not authors):
 *   - src/lib/kpi-config.ts            → display thresholds (per-level KPI bands)
 *   - src/lib/operational-canon.ts     → formulas + time windows
 *   - supabase/functions/sync-kpis     → must consume PLACEMENT.readiness
 *
 * Memory: mem://architecture/canonical-thresholds
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── 1. PLACEMENT READINESS (L4→L5/L6 gate) ────────────────────────────
// Authoritative gate used by sync-kpis edge function and Placement page.
// Values preserved from existing PLACEMENT_GATE / PLACEMENT_KPI_TARGETS.
export const PLACEMENT = Object.freeze({
  readiness: Object.freeze({
    closing_rate:      25,   // %
    calls_per_week:    15,   // count
    show_rate:         70,   // %
    follow_up_rate:    100,  // %
    crm_hygiene_score: 100,  // %
  }),
  /** Min weeks of stable KPI performance required (kpi-config.ts). */
  stability_weeks: 3,
} as const);

// ─── 2. PROGRESSION THRESHOLDS (per-level KPI floors) ──────────────────
// Values derived from KPI_THRESHOLDS in src/lib/kpi-config.ts (preserved).
// Exposed here so non-UI code (edge functions, RPC) can consume them.
export const PROGRESSION = Object.freeze({
  L1: { show_rate: 60, storno_rate: 15, response_time: 30, follow_up_rate: 80,  crm_hygiene_score: 80 },
  L2: { show_rate: 70, qualification_accuracy: 60, handover_rate: 50, storno_rate: 12, response_time: 15, follow_up_rate: 90,  crm_hygiene_score: 90 },
  L3: { show_rate: 77, qualification_accuracy: 70, handover_rate: 60, storno_rate: 10, response_time: 10, follow_up_rate: 95,  crm_hygiene_score: 95 },
  L4: { closing_rate: 20, show_rate: 75, revenue_closed: 10000, storno_rate: 10, response_time: 10, follow_up_rate: 95,  crm_hygiene_score: 95 },
  L5: { closing_rate: 27, show_rate: 80, revenue_closed: 25000, storno_rate: 8,  response_time: 5,  follow_up_rate: 100, crm_hygiene_score: 98 },
  L6: { closing_rate: 32, show_rate: 85, revenue_closed: 50000, storno_rate: 5,  response_time: 5,  follow_up_rate: 100, crm_hygiene_score: 98 },
} as const);

// ─── 3. PERFORMANCE / FAIRNESS CAPS ────────────────────────────────────
export const PERFORMANCE = Object.freeze({
  /** Min calls before close-rate is statistically meaningful (anti-gaming). */
  min_calls_for_ranking: 20,
  /** Min sample size before any leaderboard ranking is published. */
  min_sample_for_leaderboard: 10,
  /** OSS revenue window / activity window (mirrors operational-canon.ts). */
  oss_activity_days: 7,
  oss_revenue_days: 30,
} as const);

// ─── 4. ROUTING / LEAD-ASSIGNMENT WEIGHTS ──────────────────────────────
export const ROUTING = Object.freeze({
  weight_capacity:     0.40,
  weight_performance:  0.40,
  weight_fairness:     0.20,
  /** High-tier lead score cutoff → priority routing. */
  high_tier_score:     75,
} as const);

// ─── 5. FAST-TRACK / SELF-CLOSING ──────────────────────────────────────
export const FAST_TRACK = Object.freeze({
  /** Lead score above which Setter-Call may be skipped. */
  self_qualification_score: 75,
  /** Quiz completion gate before fast-track is offered. */
  min_quiz_completion: 1,
} as const);

// ─── 6. CERTIFICATION ──────────────────────────────────────────────────
export const CERTIFICATION = Object.freeze({
  theory_pass:        80,   // %
  simulation_pass:    75,   // %
  realtime_min_calls: 3,
  /** Final readiness composite required for "Certified Online Sales Pro". */
  final_readiness:    80,
} as const);

// ─── 7. CONSISTENCY / INACTIVITY WINDOWS (days) ────────────────────────
export const CONSISTENCY = Object.freeze({
  inactive_warn_days: 3,   // emits inactive_3d
  inactive_risk_days: 7,   // emits inactive_7d
  reactivation_target_days: 14,
} as const);

// ─── 8. PRICING / PROGRAM (commerce gates) ─────────────────────────────
export const PRICING = Object.freeze({
  /** Default program duration (weeks) used in checkout consent. */
  program_duration_weeks: 12,
} as const);

// ─── DEV-MODE GUARD ────────────────────────────────────────────────────
/** Asserts `value === expected` at dev time. Use to detect drift in callers. */
export function assertThreshold(name: string, value: number, expected: number): void {
  if (import.meta.env?.DEV && value !== expected) {
    // eslint-disable-next-line no-console
    console.error(
      `[CanonicalThresholds] Drift detected for "${name}": got ${value}, expected ${expected}. ` +
      `Import from src/lib/canonical-thresholds.ts instead of hardcoding.`,
    );
  }
}

// ─── CONVENIENCE TYPES ─────────────────────────────────────────────────
export type PlacementGateKey   = keyof typeof PLACEMENT.readiness;
export type ProgressionLevel   = keyof typeof PROGRESSION;
