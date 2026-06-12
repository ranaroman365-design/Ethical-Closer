/**
 * Layer 27 — Intelligent Ad Spend Throttling (Canon)
 *
 * Hard rules:
 *   1. Capacity defines traffic — never the inverse.
 *   2. Decision-support only. No automatic spend changes.
 *   3. Single source of truth = `capacity_status()` (Layer 25) + `ad_spend_daily`.
 *   4. No new tracking layer. Pure derivation from existing canonical data.
 *
 * Block: Foundation (capacity) + Acquisition (spend) + Governance (operator authority).
 */
import type { CapacityRow, CapacityStatus } from './canonical-capacity';

export type ThrottleAction = 'scale' | 'maintain' | 'hold' | 'reduce' | 'pause';
export type QualityFlag = 'show_drop' | 'qualification_drop' | 'capacity_idle' | null;

export interface FunnelIntake {
  /** Funnel/source name (e.g. 'meta', 'organic', 'team_oleg'). */
  source: string;
  /** Daily spend €, last reported day. */
  current_spend: number;
  /** Leads in the same window. */
  leads: number;
  /** Bookings in the same window. */
  bookings: number;
  /** Show rate 0-1 over recent window. */
  show_rate: number;
  /** 7d baseline show rate 0-1 — used to detect drops. */
  show_rate_baseline: number;
  /** Quiz→booking rate 0-1. */
  qualification_rate: number;
  /** Baseline qualification rate 0-1. */
  qualification_rate_baseline: number;
}

export interface ThrottleRecommendation {
  source: string;
  capacity_state: CapacityStatus;
  utilization_pct: number;
  action: ThrottleAction;
  /** Suggested delta vs current spend, e.g. -0.30, +0.15, 0. */
  delta_pct: number;
  /** Recommended absolute spend range €. */
  spend_min: number;
  spend_max: number;
  current_spend: number;
  reason: string;
  quality_flag: QualityFlag;
}

const SHOW_DROP_THRESHOLD = 0.15;          // 15-pt absolute drop vs baseline
const QUALIFICATION_DROP_THRESHOLD = 0.20; // 20% relative drop vs baseline

/**
 * Aggregate per-funnel capacity from CapacityRow[]. We use the worst (highest
 * utilization) closer/setter as the binding constraint — a chain is only as
 * strong as its tightest link.
 */
export function bindingCapacity(rows: CapacityRow[]): {
  state: CapacityStatus;
  utilization_pct: number;
  has_backlog: boolean;
} {
  if (!rows.length) {
    return { state: 'safe', utilization_pct: 0, has_backlog: false };
  }
  const worst = rows.reduce((acc, r) =>
    r.utilization_pct > acc.utilization_pct ? r : acc,
  );
  const has_backlog = rows.some((r) => r.backlog > 0);
  return {
    state: worst.status,
    utilization_pct: worst.utilization_pct,
    has_backlog,
  };
}

/**
 * Pure decision function — capacity + intake → recommendation.
 * No I/O. Trivially testable.
 */
export function recommendThrottle(
  intake: FunnelIntake,
  capacity: { state: CapacityStatus; utilization_pct: number; has_backlog: boolean },
): ThrottleRecommendation {
  const { current_spend } = intake;

  // Quality-first checks override capacity logic.
  const showDrop = intake.show_rate_baseline - intake.show_rate >= SHOW_DROP_THRESHOLD;
  const qualDrop =
    intake.qualification_rate_baseline > 0 &&
    (intake.qualification_rate_baseline - intake.qualification_rate) /
      intake.qualification_rate_baseline >=
      QUALIFICATION_DROP_THRESHOLD;

  // Capacity idle but no leads → suggest scale.
  const capacityIdle =
    capacity.state === 'safe' &&
    capacity.utilization_pct < 40 &&
    intake.leads < 1;

  let action: ThrottleAction;
  let delta_pct: number;
  let reason: string;
  let quality_flag: QualityFlag = null;

  if (showDrop) {
    action = 'hold';
    delta_pct = 0;
    quality_flag = 'show_drop';
    reason = `Show rate dropped ${Math.round((intake.show_rate_baseline - intake.show_rate) * 100)}pts vs baseline. Quality issue — fix before scaling.`;
  } else if (qualDrop) {
    action = 'hold';
    delta_pct = 0;
    quality_flag = 'qualification_drop';
    reason = `Qualification rate down ${Math.round(((intake.qualification_rate_baseline - intake.qualification_rate) / intake.qualification_rate_baseline) * 100)}%. Lead quality issue — review targeting.`;
  } else if (capacity.state === 'overloaded' && capacity.has_backlog && capacity.utilization_pct >= 100) {
    action = 'pause';
    delta_pct = -1;
    reason = `Capacity ${capacity.utilization_pct}%, backlog growing. Pause until backlog clears.`;
  } else if (capacity.state === 'overloaded') {
    action = 'reduce';
    delta_pct = capacity.has_backlog ? -0.4 : -0.2;
    reason = `Capacity ${capacity.utilization_pct}%${capacity.has_backlog ? ', backlog detected' : ''}. Reduce spend to protect lead quality.`;
  } else if (capacity.state === 'warning') {
    action = 'hold';
    delta_pct = 0;
    reason = `Capacity ${capacity.utilization_pct}%. Hold spend until utilization stabilizes.`;
  } else if (capacityIdle) {
    action = 'scale';
    delta_pct = 0.2;
    quality_flag = 'capacity_idle';
    reason = `Capacity at ${capacity.utilization_pct}% with no inbound leads. Safe to scale traffic.`;
  } else {
    action = 'scale';
    delta_pct = 0.1;
    reason = `Capacity ${capacity.utilization_pct}%, healthy intake. Controlled scale recommended.`;
  }

  // Recommended spend range (±5% band around target).
  const target = action === 'pause' ? 0 : Math.max(0, current_spend * (1 + delta_pct));
  const band = action === 'pause' ? 0 : Math.max(target * 0.05, 5);
  return {
    source: intake.source,
    capacity_state: capacity.state,
    utilization_pct: capacity.utilization_pct,
    action,
    delta_pct,
    spend_min: Math.max(0, Math.round(target - band)),
    spend_max: Math.round(target + band),
    current_spend: Math.round(current_spend),
    reason,
    quality_flag,
  };
}

export function actionLabel(action: ThrottleAction, lang: 'de' | 'en'): string {
  const map = {
    de: { scale: 'Skalieren', maintain: 'Halten', hold: 'Pausieren (halten)', reduce: 'Reduzieren', pause: 'Stoppen' },
    en: { scale: 'Scale', maintain: 'Maintain', hold: 'Hold', reduce: 'Reduce', pause: 'Pause' },
  };
  return map[lang][action];
}

export function actionTone(action: ThrottleAction): string {
  switch (action) {
    case 'scale':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'maintain':
    case 'hold':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'reduce':
      return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'pause':
      return 'text-rose-700 bg-rose-50 border-rose-200';
  }
}
