/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONVERSION INTELLIGENCE LAYER™ (ETC Canon Level)
 * Layer 47 — Self-Optimizing Decision Engine
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NOT reporting. A decision machine.
 *
 * Input:  State Machine Events → KPIs → Lead Flows
 * Output: Bottlenecks → Root Causes → Actions → Alerts → Priorities
 *
 * Architecture:
 *   Events → KPI Engine → Intelligence Engine → Insights → Actions → Operator Execution
 *
 * HARD RULES:
 *   ❗ Kein KPI ohne Event
 *   ❗ Kein Insight ohne Action
 *   ❗ Kein Alert ohne Priorität
 *   ❗ Kein Operator ohne Score
 *   ❗ Kein Bottleneck ohne Root Cause
 *
 * Depends on: src/lib/conversion-state-machine.ts (Layer 47)
 *             src/lib/operational-canon.ts (Layer 12)
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { ConversionState } from './conversion-state-machine';

// ─── BOTTLENECK TYPES ──────────────────────────────────────────────────
export const BOTTLENECK_TYPES = Object.freeze({
  SHOW:      'show',
  CLOSE:     'close',
  RECOVERY:  'recovery',
  PRE_CALL:  'pre_call',
  BOOKING:   'booking',
} as const);

export type BottleneckType = typeof BOTTLENECK_TYPES[keyof typeof BOTTLENECK_TYPES];

// ─── BOTTLENECK THRESHOLDS ─────────────────────────────────────────────
export const BOTTLENECK_THRESHOLDS = Object.freeze({
  show:     { critical: 0.50, warning: 0.65, target: 0.75 },
  close:    { critical: 0.10, warning: 0.20, target: 0.30 },
  recovery: { critical: 0.15, warning: 0.25, target: 0.35 },
  pre_call: { critical: 0.30, warning: 0.50, target: 0.70 },
  booking:  { critical: 0.10, warning: 0.20, target: 0.30 },
} as const);

export type Severity = 'critical' | 'warning' | 'healthy';

export interface BottleneckResult {
  type: BottleneckType;
  severity: Severity;
  currentValue: number;
  threshold: number;
  impactScore: number;
  rootCauses: RootCause[];
}

/**
 * Detect bottleneck severity for a given KPI value.
 */
export function detectBottleneck(
  type: BottleneckType,
  value: number,
  leadsAffected: number,
  avgDealValue: number,
): BottleneckResult {
  const t = BOTTLENECK_THRESHOLDS[type];
  let severity: Severity = 'healthy';
  let threshold: number = t.target;

  if (value < t.critical) {
    severity = 'critical';
    threshold = t.critical as number;
  } else if (value < t.warning) {
    severity = 'warning';
    threshold = t.warning as number;
  }

  const dropoff = Math.max(0, t.target - value);
  const impactScore = leadsAffected * dropoff * avgDealValue;

  return {
    type,
    severity,
    currentValue: value,
    threshold,
    impactScore,
    rootCauses: [],
  };
}

/**
 * Detect all bottlenecks from a KPI snapshot and sort by impact.
 */
export function detectAllBottlenecks(kpis: FunnelKpis, context: ImpactContext): BottleneckResult[] {
  const results: BottleneckResult[] = [];

  if (kpis.showRate !== null) {
    results.push(detectBottleneck('show', kpis.showRate, context.bookedLeads, context.avgDealValue));
  }
  if (kpis.closeRate !== null) {
    results.push(detectBottleneck('close', kpis.closeRate, context.showedLeads, context.avgDealValue));
  }
  if (kpis.recoveryRate !== null) {
    results.push(detectBottleneck('recovery', kpis.recoveryRate, context.noShowLeads, context.avgDealValue));
  }
  if (kpis.preCallCompletionRate !== null) {
    results.push(detectBottleneck('pre_call', kpis.preCallCompletionRate, context.preCallPendingLeads, context.avgDealValue));
  }

  return results
    .filter(b => b.severity !== 'healthy')
    .sort((a, b) => b.impactScore - a.impactScore);
}

// ─── KPI ENGINE ────────────────────────────────────────────────────────
export interface FunnelKpis {
  showRate: number | null;
  closeRate: number | null;
  recoveryRate: number | null;
  rebookRate: number | null;
  preCallCompletionRate: number | null;
  showRatePrepared: number | null;
  showRateUnprepared: number | null;
  closeRatePrepared: number | null;
  revenuePerLead: number | null;
  revenuePerPreparedLead: number | null;
  recoveryShowRate: number | null;
  recoveryCloseRate: number | null;
  revenueRecovered: number | null;
}

export interface ImpactContext {
  bookedLeads: number;
  showedLeads: number;
  noShowLeads: number;
  preCallPendingLeads: number;
  avgDealValue: number;
}

/** Safe division — returns null instead of NaN/Infinity. */
function safeDivide(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

export interface FunnelCounts {
  booked: number;
  preCallPending: number;
  preCallCompleted: number;
  showed: number;
  showedPrepared: number;
  showedUnprepared: number;
  closedWon: number;
  closedWonPrepared: number;
  closedLost: number;
  noShow: number;
  recoveryActive: number;
  rebooked: number;
  rebookShowed: number;
  rebookWon: number;
  totalLeads: number;
  totalRevenue: number;
  revenuePrepared: number;
  revenueRecovered: number;
}

/**
 * Compute all funnel KPIs from raw counts.
 * Single source of truth for KPI calculation — never compute elsewhere.
 */
export function computeFunnelKpis(c: FunnelCounts): FunnelKpis {
  return {
    showRate:               safeDivide(c.showed, c.booked),
    closeRate:              safeDivide(c.closedWon, c.showed),
    recoveryRate:           safeDivide(c.recoveryActive, c.noShow),
    rebookRate:             safeDivide(c.rebooked, c.recoveryActive),
    preCallCompletionRate:  safeDivide(c.preCallCompleted, c.preCallPending),
    showRatePrepared:       safeDivide(c.showedPrepared, c.preCallCompleted),
    showRateUnprepared:     safeDivide(c.showedUnprepared, Math.max(0, c.preCallPending - c.preCallCompleted)),
    closeRatePrepared:      safeDivide(c.closedWonPrepared, c.showedPrepared),
    revenuePerLead:         safeDivide(c.totalRevenue, c.totalLeads),
    revenuePerPreparedLead: safeDivide(c.revenuePrepared, c.preCallCompleted),
    recoveryShowRate:       safeDivide(c.rebookShowed, c.rebooked),
    recoveryCloseRate:      safeDivide(c.rebookWon, c.rebookShowed),
    revenueRecovered:       c.revenueRecovered,
  };
}

// ─── OPERATOR SCORING ──────────────────────────────────────────────────
export const OPERATOR_SCORE_WEIGHTS = Object.freeze({
  showRate:       0.30,
  closeRate:      0.30,
  recoveryRate:   0.20,
  revenuePerLead: 0.20,
} as const);

export type OperatorTier = 'a_player' | 'solid' | 'at_risk' | 'critical';

export const OPERATOR_TIERS = Object.freeze({
  a_player: { min: 85, label: 'A Player' },
  solid:    { min: 70, label: 'Solid' },
  at_risk:  { min: 50, label: 'At Risk' },
  critical: { min: 0,  label: 'Critical' },
} as const);

export interface OperatorScore {
  totalScore: number;
  tier: OperatorTier;
  components: {
    showRate: number;
    closeRate: number;
    recoveryRate: number;
    revenuePerLead: number;
  };
}

/**
 * Compute operator score (0–100) from KPIs.
 * Each component is normalized against its target threshold.
 */
export function computeOperatorScore(kpis: FunnelKpis): OperatorScore {
  const normalize = (value: number | null, target: number): number => {
    if (value === null) return 50; // neutral if no data
    return Math.min(100, Math.max(0, (value / target) * 100));
  };

  const components = {
    showRate:       normalize(kpis.showRate, BOTTLENECK_THRESHOLDS.show.target),
    closeRate:      normalize(kpis.closeRate, BOTTLENECK_THRESHOLDS.close.target),
    recoveryRate:   normalize(kpis.recoveryRate, BOTTLENECK_THRESHOLDS.recovery.target),
    revenuePerLead: normalize(kpis.revenuePerLead, 500), // €500 baseline
  };

  const totalScore =
    components.showRate       * OPERATOR_SCORE_WEIGHTS.showRate +
    components.closeRate      * OPERATOR_SCORE_WEIGHTS.closeRate +
    components.recoveryRate   * OPERATOR_SCORE_WEIGHTS.recoveryRate +
    components.revenuePerLead * OPERATOR_SCORE_WEIGHTS.revenuePerLead;

  let tier: OperatorTier = 'critical';
  if (totalScore >= OPERATOR_TIERS.a_player.min) tier = 'a_player';
  else if (totalScore >= OPERATOR_TIERS.solid.min) tier = 'solid';
  else if (totalScore >= OPERATOR_TIERS.at_risk.min) tier = 'at_risk';

  return { totalScore: Math.round(totalScore * 10) / 10, tier, components };
}

// ─── ROOT CAUSE ENGINE ─────────────────────────────────────────────────
export interface RootCause {
  factor: string;
  description: string;
  contribution: number; // 0-1, how much this factor contributes
  dataPoint: string;
}

export interface RootCauseContext {
  preCallCompletionRate: number | null;
  reminderOpenRate: number | null;
  avgTimeToBookingHours: number | null;
  showRateBySource: Record<string, number>;
  closeRateBySource: Record<string, number>;
}

/**
 * Analyze root causes for a given bottleneck.
 */
export function analyzeRootCauses(
  bottleneck: BottleneckResult,
  context: RootCauseContext,
): RootCause[] {
  const causes: RootCause[] = [];

  switch (bottleneck.type) {
    case 'show': {
      if (context.preCallCompletionRate !== null && context.preCallCompletionRate < 0.5) {
        causes.push({
          factor: 'low_pre_call_completion',
          description: `${Math.round((1 - context.preCallCompletionRate) * 100)}% ohne Pre-Call Completion`,
          contribution: 0.4,
          dataPoint: `${Math.round(context.preCallCompletionRate * 100)}% completion`,
        });
      }
      if (context.reminderOpenRate !== null && context.reminderOpenRate < 0.5) {
        causes.push({
          factor: 'low_reminder_open_rate',
          description: `Reminder werden kaum geöffnet (${Math.round(context.reminderOpenRate * 100)}%)`,
          contribution: 0.25,
          dataPoint: `${Math.round(context.reminderOpenRate * 100)}% open rate`,
        });
      }
      if (context.avgTimeToBookingHours !== null && context.avgTimeToBookingHours > 72) {
        causes.push({
          factor: 'long_booking_delay',
          description: `Zu lange Zeit zwischen Booking und Call (${Math.round(context.avgTimeToBookingHours)}h)`,
          contribution: 0.2,
          dataPoint: `${Math.round(context.avgTimeToBookingHours)}h avg delay`,
        });
      }
      for (const [source, rate] of Object.entries(context.showRateBySource)) {
        if (rate < bottleneck.currentValue * 0.8) {
          causes.push({
            factor: `weak_source_${source}`,
            description: `${source} zeigt ${Math.round((1 - rate / bottleneck.currentValue) * 100)}% schlechtere Show Rate`,
            contribution: 0.15,
            dataPoint: `${source}: ${Math.round(rate * 100)}%`,
          });
        }
      }
      break;
    }

    case 'close': {
      for (const [source, rate] of Object.entries(context.closeRateBySource)) {
        if (rate < bottleneck.currentValue * 0.7) {
          causes.push({
            factor: `weak_close_source_${source}`,
            description: `${source} hat deutlich niedrigere Close Rate`,
            contribution: 0.3,
            dataPoint: `${source}: ${Math.round(rate * 100)}%`,
          });
        }
      }
      if (context.preCallCompletionRate !== null && context.preCallCompletionRate < 0.5) {
        causes.push({
          factor: 'unprepared_leads_closing',
          description: 'Viele Leads ohne Pre-Call im Close-Call',
          contribution: 0.35,
          dataPoint: `${Math.round(context.preCallCompletionRate * 100)}% pre-call rate`,
        });
      }
      break;
    }

    case 'recovery': {
      causes.push({
        factor: 'recovery_system_gap',
        description: 'Recovery-Nachrichten werden nicht gesendet oder nicht geöffnet',
        contribution: 0.5,
        dataPoint: `Recovery Rate: ${Math.round(bottleneck.currentValue * 100)}%`,
      });
      break;
    }

    case 'pre_call': {
      causes.push({
        factor: 'pre_call_link_not_sent',
        description: 'Pre-Call Links werden nicht rechtzeitig versendet',
        contribution: 0.4,
        dataPoint: `Completion: ${Math.round(bottleneck.currentValue * 100)}%`,
      });
      causes.push({
        factor: 'pre_call_ux',
        description: 'Pre-Call UX könnte Abschlussrate senken',
        contribution: 0.3,
        dataPoint: `${Math.round(bottleneck.currentValue * 100)}% completion`,
      });
      break;
    }
  }

  return causes.sort((a, b) => b.contribution - a.contribution);
}

// ─── ACTION ENGINE ─────────────────────────────────────────────────────
export const INTELLIGENCE_ACTION_TYPES = Object.freeze({
  COMMUNICATE: 'communicate',
  COACH:       'coach',
  REALLOCATE:  'reallocate',
  ESCALATE:    'escalate',
  FIX_SYSTEM:  'fix_system',
} as const);

export type IntelligenceActionType = typeof INTELLIGENCE_ACTION_TYPES[keyof typeof INTELLIGENCE_ACTION_TYPES];

export interface IntelligenceAction {
  type: IntelligenceActionType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  targetRole: 'setter' | 'closer' | 'operator' | 'system';
  estimatedImpact: string;
}

/**
 * Generate recommended actions based on detected bottlenecks.
 */
export function generateActions(bottlenecks: BottleneckResult[]): IntelligenceAction[] {
  const actions: IntelligenceAction[] = [];

  for (const bn of bottlenecks) {
    switch (bn.type) {
      case 'show':
        if (bn.severity === 'critical') {
          actions.push({
            type: 'fix_system',
            priority: 'critical',
            title: 'Pre-Call System reviewen',
            description: 'Show Rate kritisch niedrig. Pre-Call Flow und Reminder-System sofort prüfen.',
            targetRole: 'operator',
            estimatedImpact: `+${Math.round(bn.impactScore)}€ potenzieller Revenue`,
          });
        }
        actions.push({
          type: 'communicate',
          priority: bn.severity === 'critical' ? 'critical' : 'high',
          title: 'Leads mit offener Pre-Call kontaktieren',
          description: 'Leads ohne Pre-Call-Completion direkt anrufen und Commitment sichern.',
          targetRole: 'setter',
          estimatedImpact: '+10-15% Show Rate',
        });
        break;

      case 'close':
        actions.push({
          type: 'coach',
          priority: bn.severity === 'critical' ? 'critical' : 'high',
          title: 'Closer Coaching: Objection Handling',
          description: 'Close Rate unter Target. Closer-Training zu Einwandbehandlung starten.',
          targetRole: 'closer',
          estimatedImpact: '+5-10% Close Rate',
        });
        break;

      case 'recovery':
        actions.push({
          type: 'fix_system',
          priority: bn.severity === 'critical' ? 'critical' : 'medium',
          title: 'Recovery-Flow optimieren',
          description: 'No-Show Recovery Rate niedrig. Nachrichten-Timing und Inhalte anpassen.',
          targetRole: 'system',
          estimatedImpact: '+15-25% Recovery Rate',
        });
        actions.push({
          type: 'communicate',
          priority: 'high',
          title: 'No-Show Leads sofort kontaktieren',
          description: 'Alle aktiven No-Shows manuell erreichen für Rebook.',
          targetRole: 'setter',
          estimatedImpact: '+20% Rebook Rate',
        });
        break;

      case 'pre_call':
        actions.push({
          type: 'fix_system',
          priority: bn.severity === 'critical' ? 'critical' : 'medium',
          title: 'Pre-Call Completion steigern',
          description: 'Pre-Call Link automatisch sofort nach Booking senden. UX vereinfachen.',
          targetRole: 'system',
          estimatedImpact: '+20% Completion Rate',
        });
        break;
    }
  }

  return actions.sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return prio[a.priority] - prio[b.priority];
  });
}

// ─── ALERT SYSTEM ──────────────────────────────────────────────────────
export const ALERT_RULES = Object.freeze([
  { kpi: 'showRate',              criticalBelow: 0.50, warningBelow: 0.65, label: 'Show Rate' },
  { kpi: 'closeRate',             criticalBelow: 0.10, warningBelow: 0.20, label: 'Close Rate' },
  { kpi: 'recoveryRate',          criticalBelow: 0.15, warningBelow: 0.25, label: 'Recovery Rate' },
  { kpi: 'preCallCompletionRate', criticalBelow: 0.30, warningBelow: 0.50, label: 'Pre-Call Rate' },
] as const);

export interface IntelligenceAlert {
  kpi: string;
  label: string;
  severity: 'critical' | 'warning';
  currentValue: number;
  threshold: number;
  message: string;
}

/**
 * Generate alerts from current KPIs.
 */
export function generateAlerts(kpis: FunnelKpis): IntelligenceAlert[] {
  const alerts: IntelligenceAlert[] = [];

  for (const rule of ALERT_RULES) {
    const value = kpis[rule.kpi as keyof FunnelKpis];
    if (typeof value !== 'number') continue;

    if (value < rule.criticalBelow) {
      alerts.push({
        kpi: rule.kpi,
        label: rule.label,
        severity: 'critical',
        currentValue: value,
        threshold: rule.criticalBelow,
        message: `🔴 Critical: ${rule.label} = ${Math.round(value * 100)}% (Schwelle: ${Math.round(rule.criticalBelow * 100)}%)`,
      });
    } else if (value < rule.warningBelow) {
      alerts.push({
        kpi: rule.kpi,
        label: rule.label,
        severity: 'warning',
        currentValue: value,
        threshold: rule.warningBelow,
        message: `🟡 Warning: ${rule.label} = ${Math.round(value * 100)}% (Schwelle: ${Math.round(rule.warningBelow * 100)}%)`,
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
}

// ─── FULL INTELLIGENCE SNAPSHOT ────────────────────────────────────────
export interface IntelligenceSnapshot {
  timestamp: string;
  operatorId: string | null;
  period: { start: string; end: string };
  kpis: FunnelKpis;
  operatorScore: OperatorScore | null;
  bottlenecks: BottleneckResult[];
  actions: IntelligenceAction[];
  alerts: IntelligenceAlert[];
}

/**
 * Compute a full intelligence snapshot from funnel counts.
 * This is the SINGLE entry point for all intelligence computation.
 */
export function computeIntelligenceSnapshot(
  counts: FunnelCounts,
  context: ImpactContext & { operatorId?: string; periodStart: string; periodEnd: string; rootCauseContext?: RootCauseContext },
): IntelligenceSnapshot {
  const kpis = computeFunnelKpis(counts);
  const bottlenecks = detectAllBottlenecks(kpis, context);

  // Enrich bottlenecks with root causes if context provided
  if (context.rootCauseContext) {
    for (const bn of bottlenecks) {
      bn.rootCauses = analyzeRootCauses(bn, context.rootCauseContext);
    }
  }

  const actions = generateActions(bottlenecks);
  const alerts = generateAlerts(kpis);
  const operatorScore = context.operatorId ? computeOperatorScore(kpis) : null;

  return {
    timestamp: new Date().toISOString(),
    operatorId: context.operatorId ?? null,
    period: { start: context.periodStart, end: context.periodEnd },
    kpis,
    operatorScore,
    bottlenecks,
    actions,
    alerts,
  };
}

// ─── AUTOMATION HOOKS (Event → Intelligence Update) ────────────────────
export const INTELLIGENCE_EVENT_HOOKS: Readonly<Record<string, string[]>> = Object.freeze({
  'pre_call_answer_submitted': ['preCallCompletionRate', 'showRatePrepared'],
  'call_no_show':              ['showRate', 'recoveryRate', 'noShowRate'],
  'call_showed':               ['showRate', 'showRatePrepared', 'showRateUnprepared'],
  'call_closed_won':           ['closeRate', 'revenuePerLead', 'closeRatePrepared'],
  'call_closed_lost':          ['closeRate'],
  'recovery_started':          ['recoveryRate'],
  'rebooked':                  ['rebookRate', 'recoveryShowRate'],
  'appointment_booked':        ['preCallCompletionRate'],
});

/**
 * Determine which KPIs need recomputation after an event.
 */
export function getAffectedKpis(event: string): string[] {
  return INTELLIGENCE_EVENT_HOOKS[event] ?? [];
}
