/**
 * ═══════════════════════════════════════════════════════════════════════
 * L6 PERFORMANCE INTELLIGENCE™ (Phase 5)
 * Layer 47 — Operator as Profit Center
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Turns every L6 (Operator) into a measurable profit center.
 *
 * HARD RULES:
 *   ❗ Revenue = calls.revenue WHERE result='closed_won' — NEVER deal_value
 *   ❗ All KPIs derived from canonical events only
 *   ❗ Priority segmentation via computeCanonicalDecision()
 *   ❗ No raw field access in dashboards
 *   ❗ North Star = Revenue per Operator (30d)
 *
 * Depends on:
 *   - src/lib/canonical-decision-engine.ts (Layer 51)
 *   - src/lib/conversion-intelligence-engine.ts (Layer 47)
 * ═══════════════════════════════════════════════════════════════════════
 */

import {
  computeCanonicalDecision,
  type LeadPriority,
  type CanonicalDecision,
  getCanonicalEventType,
} from './canonical-decision-engine';

import {
  computeFunnelKpis,
  detectAllBottlenecks,
  generateActions,
  generateAlerts,
  type FunnelCounts,
  type FunnelKpis,
  type BottleneckResult,
  type IntelligenceAction,
  type IntelligenceAlert,
  type ImpactContext,
} from './conversion-intelligence-engine';

// ─── TYPES ─────────────────────────────────────────────────────────────

export interface L6FunnelCounts {
  leads_created: number;
  quiz_completed: number;
  booked: number;
  showed: number;
  closed_won: number;
  confirmed_revenue: number;
}

export interface L6DerivedRates {
  booking_rate: number | null;
  show_rate: number | null;
  close_rate: number | null;
  revenue_per_lead: number | null;
}

export interface PrioritySegmentedKpis {
  HIGH: L6FunnelCounts & L6DerivedRates;
  MEDIUM: L6FunnelCounts & L6DerivedRates;
  LOW: L6FunnelCounts & L6DerivedRates;
}

export type L6OperatorTier = 'ELITE' | 'STRONG' | 'AVERAGE' | 'CRITICAL';

export interface L6OperatorScore {
  score: number;
  tier: L6OperatorTier;
  components: {
    show_rate: number;
    close_rate: number;
    revenue_per_lead: number;
    recovery_rate: number;
  };
}

export interface TeamMemberPerformance {
  user_id: string;
  name: string;
  role: 'setter' | 'closer';
  assigned_leads: number;
  shows: number;
  closes: number;
  revenue: number;
  show_rate: number | null;
  close_rate: number | null;
  revenue_per_call: number | null;
}

export interface L6BottleneckResult {
  bottleneck_type: 'acquisition' | 'attendance' | 'closing';
  severity: number; // 0-100
  affected_leads_count: number;
  description: string;
}

export interface L6PerformanceSnapshot {
  operator_id: string;
  period: { start: string; end: string };
  // North Star
  revenue_per_operator_30d: number;
  // Aggregate
  totals: L6FunnelCounts & L6DerivedRates;
  // Priority segmented
  by_priority: PrioritySegmentedKpis;
  // Operator score
  operator_score: L6OperatorScore;
  // Bottlenecks
  bottlenecks: L6BottleneckResult[];
  // Team
  team: TeamMemberPerformance[];
  // Trend
  trend: { current_7d: number; previous_7d: number; direction: 'up' | 'down' | 'flat' };
  // Actions
  actions: IntelligenceAction[];
  // Alerts
  alerts: IntelligenceAlert[];
  timestamp: string;
}

// ─── SAFE DIVIDE ───────────────────────────────────────────────────────

function safeDivide(num: number, den: number): number | null {
  if (den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return num / den;
}

// ─── FUNNEL COUNTS FROM LEADS + CALLS ──────────────────────────────────

/**
 * Build L6 funnel counts from raw leads and calls data.
 * Uses computeCanonicalDecision() for every lead — no raw field access.
 * Revenue sourced ONLY from calls.revenue where result = 'closed_won'.
 */
export function buildL6FunnelCounts(
  leads: Record<string, any>[],
  calls: Record<string, any>[],
  events: Record<string, any>[],
): { totals: L6FunnelCounts; byPriority: Record<LeadPriority, L6FunnelCounts> } {
  const empty = (): L6FunnelCounts => ({
    leads_created: 0, quiz_completed: 0, booked: 0, showed: 0, closed_won: 0, confirmed_revenue: 0,
  });

  const totals = empty();
  const byPriority: Record<LeadPriority, L6FunnelCounts> = { HIGH: empty(), MEDIUM: empty(), LOW: empty() };

  // Build a set of lead IDs that reached each canonical event
  const leadEvents: Record<string, Set<string>> = {};
  for (const evt of events) {
    const canonical = getCanonicalEventType(evt.event_type ?? evt.event_name ?? '');
    if (!canonical) continue;
    const lid = evt.lead_id;
    if (!lid) continue;
    if (!leadEvents[lid]) leadEvents[lid] = new Set();
    leadEvents[lid].add(canonical);
  }

  // Revenue per lead from calls (ONLY calls.revenue where result = closed_won)
  const revenueByLead: Record<string, number> = {};
  for (const call of calls) {
    if (call.result === 'closed_won' && typeof call.revenue === 'number' && call.revenue > 0) {
      const lid = call.lead_id;
      if (lid) revenueByLead[lid] = (revenueByLead[lid] ?? 0) + call.revenue;
    }
  }

  for (const lead of leads) {
    const { priority } = computeCanonicalDecision(lead);
    const evts = leadEvents[lead.id] ?? new Set();
    const rev = revenueByLead[lead.id] ?? 0;

    // Count canonical milestones
    const counts = [totals, byPriority[priority]];
    for (const c of counts) {
      c.leads_created++;
      if (evts.has('quiz_completed')) c.quiz_completed++;
      if (evts.has('booked')) c.booked++;
      if (evts.has('showed')) c.showed++;
      if (evts.has('closed_won')) {
        c.closed_won++;
        c.confirmed_revenue += rev;
      }
    }
  }

  return { totals, byPriority };
}

// ─── DERIVE RATES ──────────────────────────────────────────────────────

export function deriveRates(c: L6FunnelCounts): L6DerivedRates {
  return {
    booking_rate: safeDivide(c.booked, c.quiz_completed),
    show_rate: safeDivide(c.showed, c.booked),
    close_rate: safeDivide(c.closed_won, c.showed),
    revenue_per_lead: safeDivide(c.confirmed_revenue, c.leads_created),
  };
}

// ─── OPERATOR SCORE (Phase 5 weights) ──────────────────────────────────

const L6_SCORE_WEIGHTS = {
  show_rate: 0.30,
  close_rate: 0.40,
  revenue_per_lead: 0.20,
  recovery_rate: 0.10,
} as const;

export function computeL6OperatorScore(
  rates: L6DerivedRates,
  recoveryRate: number | null,
): L6OperatorScore {
  const norm = (val: number | null, target: number): number => {
    if (val === null) return 50;
    return Math.min(100, Math.max(0, (val / target) * 100));
  };

  const components = {
    show_rate: norm(rates.show_rate, 0.75),
    close_rate: norm(rates.close_rate, 0.30),
    revenue_per_lead: norm(rates.revenue_per_lead, 500),
    recovery_rate: norm(recoveryRate, 0.35),
  };

  const score = Math.round(
    (components.show_rate * L6_SCORE_WEIGHTS.show_rate +
     components.close_rate * L6_SCORE_WEIGHTS.close_rate +
     components.revenue_per_lead * L6_SCORE_WEIGHTS.revenue_per_lead +
     components.recovery_rate * L6_SCORE_WEIGHTS.recovery_rate) * 10
  ) / 10;

  let tier: L6OperatorTier = 'CRITICAL';
  if (score >= 90) tier = 'ELITE';
  else if (score >= 75) tier = 'STRONG';
  else if (score >= 60) tier = 'AVERAGE';

  return { score, tier, components };
}

// ─── BOTTLENECK DETECTION ──────────────────────────────────────────────

export function detectL6Bottlenecks(rates: L6DerivedRates, totals: L6FunnelCounts): L6BottleneckResult[] {
  const results: L6BottleneckResult[] = [];

  // Booking rate
  if (rates.booking_rate !== null && rates.booking_rate < 0.30) {
    const dropoff = totals.quiz_completed - totals.booked;
    results.push({
      bottleneck_type: 'acquisition',
      severity: Math.min(100, Math.round((1 - rates.booking_rate / 0.30) * 100)),
      affected_leads_count: dropoff,
      description: `Booking Rate ${Math.round(rates.booking_rate * 100)}% — Acquisition problem`,
    });
  }

  // Show rate
  if (rates.show_rate !== null && rates.show_rate < 0.65) {
    const dropoff = totals.booked - totals.showed;
    results.push({
      bottleneck_type: 'attendance',
      severity: Math.min(100, Math.round((1 - rates.show_rate / 0.65) * 100)),
      affected_leads_count: dropoff,
      description: `Show Rate ${Math.round(rates.show_rate * 100)}% — Attendance problem`,
    });
  }

  // Close rate
  if (rates.close_rate !== null && rates.close_rate < 0.20) {
    const dropoff = totals.showed - totals.closed_won;
    results.push({
      bottleneck_type: 'closing',
      severity: Math.min(100, Math.round((1 - rates.close_rate / 0.20) * 100)),
      affected_leads_count: dropoff,
      description: `Close Rate ${Math.round(rates.close_rate * 100)}% — Closing problem`,
    });
  }

  // Sort by impact (severity * affected)
  return results.sort((a, b) => (b.severity * b.affected_leads_count) - (a.severity * a.affected_leads_count));
}

// ─── TEAM PERFORMANCE ──────────────────────────────────────────────────

export function computeTeamPerformance(
  members: Array<{ user_id: string; name: string; role: 'setter' | 'closer' }>,
  leadAssignments: Record<string, string>, // lead_id → user_id
  leads: Record<string, any>[],
  calls: Record<string, any>[],
): TeamMemberPerformance[] {
  const memberMap: Record<string, TeamMemberPerformance> = {};

  for (const m of members) {
    memberMap[m.user_id] = {
      ...m,
      assigned_leads: 0,
      shows: 0,
      closes: 0,
      revenue: 0,
      show_rate: null,
      close_rate: null,
      revenue_per_call: null,
    };
  }

  // Count assigned leads and shows via canonical decision
  for (const lead of leads) {
    const assignee = leadAssignments[lead.id];
    if (!assignee || !memberMap[assignee]) continue;

    const { state } = computeCanonicalDecision(lead);
    memberMap[assignee].assigned_leads++;
    if (state.attendance_flag) memberMap[assignee].shows++;
  }

  // Revenue from calls only
  for (const call of calls) {
    const uid = call.user_id ?? call.closer_id;
    if (!uid || !memberMap[uid]) continue;
    if (call.result === 'closed_won') {
      memberMap[uid].closes++;
      memberMap[uid].revenue += (typeof call.revenue === 'number' ? call.revenue : 0);
    }
  }

  // Derive rates
  return Object.values(memberMap).map(m => ({
    ...m,
    show_rate: safeDivide(m.shows, m.assigned_leads),
    close_rate: safeDivide(m.closes, m.shows),
    revenue_per_call: safeDivide(m.revenue, m.shows),
  })).sort((a, b) => b.revenue - a.revenue);
}

// ─── ACTION ENGINE (Phase 5 specific) ──────────────────────────────────

export function generateL6Actions(
  rates: L6DerivedRates,
  byPriority: PrioritySegmentedKpis,
): IntelligenceAction[] {
  const actions: IntelligenceAction[] = [];

  // Low show rate on LOW priority
  const lowShowRate = byPriority.LOW.show_rate !== null
    ? safeDivide(byPriority.LOW.showed, byPriority.LOW.booked)
    : null;
  if (lowShowRate !== null && lowShowRate < 0.50) {
    actions.push({
      type: 'communicate',
      priority: 'high',
      title: 'Fix attendance confirmation',
      description: 'Show Rate für LOW-Priority Leads unter 50%. Confirmation-Prozess verstärken.',
      targetRole: 'setter',
      estimatedImpact: '+15% Show Rate (LOW segment)',
    });
  }

  // Close rate on HIGH priority too low
  const highCloseRate = byPriority.HIGH.showed > 0
    ? safeDivide(byPriority.HIGH.closed_won, byPriority.HIGH.showed)
    : null;
  if (highCloseRate !== null && highCloseRate < 0.15) {
    actions.push({
      type: 'coach',
      priority: 'critical',
      title: 'Closer performance critical',
      description: 'Close Rate für HIGH-Priority Leads unter 15%. Sofortiges Closer-Coaching nötig.',
      targetRole: 'closer',
      estimatedImpact: '+10% Close Rate (HIGH segment)',
    });
  }

  // Setter follow-up weak (low booking rate)
  if (rates.booking_rate !== null && rates.booking_rate < 0.25) {
    actions.push({
      type: 'coach',
      priority: 'high',
      title: 'Setter follow-up weak',
      description: 'Booking Rate unter 25%. Setter-Follow-up-Prozess überprüfen.',
      targetRole: 'setter',
      estimatedImpact: '+20% Booking Rate',
    });
  }

  // Closer conversion below benchmark
  if (rates.close_rate !== null && rates.close_rate < 0.20) {
    actions.push({
      type: 'coach',
      priority: 'high',
      title: 'Closer conversion below benchmark',
      description: `Close Rate ${Math.round((rates.close_rate ?? 0) * 100)}% liegt unter dem Benchmark (20%).`,
      targetRole: 'closer',
      estimatedImpact: '+5-10% Close Rate',
    });
  }

  return actions.sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return prio[a.priority] - prio[b.priority];
  });
}

// ─── ALERT SYSTEM (Phase 5) ────────────────────────────────────────────

export function generateL6Alerts(rates: L6DerivedRates, trend: { current_7d: number; previous_7d: number }): IntelligenceAlert[] {
  const alerts: IntelligenceAlert[] = [];

  if (rates.show_rate !== null && rates.show_rate < 0.40) {
    alerts.push({
      kpi: 'show_rate', label: 'Show Rate', severity: 'critical',
      currentValue: rates.show_rate, threshold: 0.40,
      message: `🔴 Critical: Show Rate = ${Math.round(rates.show_rate * 100)}% (< 40%)`,
    });
  }

  if (rates.close_rate !== null && rates.close_rate < 0.10) {
    alerts.push({
      kpi: 'close_rate', label: 'Close Rate', severity: 'critical',
      currentValue: rates.close_rate, threshold: 0.10,
      message: `🔴 Critical: Close Rate = ${Math.round(rates.close_rate * 100)}% (< 10%)`,
    });
  }

  // Revenue drop > 30%
  if (trend.previous_7d > 0) {
    const drop = (trend.previous_7d - trend.current_7d) / trend.previous_7d;
    if (drop > 0.30) {
      alerts.push({
        kpi: 'revenue_drop', label: 'Revenue', severity: 'critical',
        currentValue: trend.current_7d, threshold: trend.previous_7d * 0.70,
        message: `🔴 Critical: Revenue Drop ${Math.round(drop * 100)}% (7d vs vorherige 7d)`,
      });
    }
  }

  // Warning: downward trend
  if (trend.previous_7d > 0 && trend.current_7d < trend.previous_7d) {
    const drop = (trend.previous_7d - trend.current_7d) / trend.previous_7d;
    if (drop > 0.10 && drop <= 0.30) {
      alerts.push({
        kpi: 'revenue_trend', label: 'Revenue Trend', severity: 'warning',
        currentValue: trend.current_7d, threshold: trend.previous_7d * 0.90,
        message: `🟡 Warning: Revenue-Trend fallend (−${Math.round(drop * 100)}% 7d)`,
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));
}

// ─── COMPUTE FULL L6 SNAPSHOT ──────────────────────────────────────────

export interface L6SnapshotInput {
  operator_id: string;
  leads: Record<string, any>[];
  calls: Record<string, any>[];
  events: Record<string, any>[];
  team_members: Array<{ user_id: string; name: string; role: 'setter' | 'closer' }>;
  lead_assignments: Record<string, string>;
  revenue_7d_current: number;
  revenue_7d_previous: number;
  recovery_rate: number | null;
  period_start: string;
  period_end: string;
}

/**
 * Compute the full L6 Performance Intelligence snapshot.
 * SINGLE entry point — no dashboard may compute KPIs outside this function.
 */
export function computeL6PerformanceSnapshot(input: L6SnapshotInput): L6PerformanceSnapshot {
  const { totals, byPriority } = buildL6FunnelCounts(input.leads, input.calls, input.events);
  const totalRates = deriveRates(totals);

  const priorityKpis: PrioritySegmentedKpis = {
    HIGH: { ...byPriority.HIGH, ...deriveRates(byPriority.HIGH) },
    MEDIUM: { ...byPriority.MEDIUM, ...deriveRates(byPriority.MEDIUM) },
    LOW: { ...byPriority.LOW, ...deriveRates(byPriority.LOW) },
  };

  const operatorScore = computeL6OperatorScore(totalRates, input.recovery_rate);
  const bottlenecks = detectL6Bottlenecks(totalRates, totals);
  const team = computeTeamPerformance(input.team_members, input.lead_assignments, input.leads, input.calls);

  const trend = {
    current_7d: input.revenue_7d_current,
    previous_7d: input.revenue_7d_previous,
    direction: (input.revenue_7d_current > input.revenue_7d_previous * 1.02 ? 'up'
      : input.revenue_7d_current < input.revenue_7d_previous * 0.98 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
  };

  const actions = generateL6Actions(totalRates, priorityKpis);
  const alerts = generateL6Alerts(totalRates, trend);

  return {
    operator_id: input.operator_id,
    period: { start: input.period_start, end: input.period_end },
    revenue_per_operator_30d: totals.confirmed_revenue,
    totals: { ...totals, ...totalRates },
    by_priority: priorityKpis,
    operator_score: operatorScore,
    bottlenecks,
    team,
    trend,
    actions,
    alerts,
    timestamp: new Date().toISOString(),
  };
}

// ─── RANKING HELPERS ───────────────────────────────────────────────────

export function rankOperators(
  snapshots: L6PerformanceSnapshot[],
): Array<L6PerformanceSnapshot & { rank: number; percentile: number }> {
  const sorted = [...snapshots].sort((a, b) => b.revenue_per_operator_30d - a.revenue_per_operator_30d);
  const total = sorted.length;
  return sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
    percentile: total > 1 ? Math.round(((total - i - 1) / (total - 1)) * 100) : 100,
  }));
}
