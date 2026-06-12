/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC EXECUTION LOOP CANON v2 — Institutional Grade
 * Deterministic behavioral engine. Closes the loop:
 *   Trigger → Communication → Action → Measurement → Governance → Recovery
 * Spec: docs/execution-loop-canon-v2.md
 * Constitution gate: every loop must declare {trigger, action, measurement, decision, recovery, priority_rank, time_horizon}.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NOT a 7th block — dynamic orchestration ACROSS the 6 blocks.
 * NOT a parallel KPI/governance source — consumes get_kpi_truth() + canonical-events + canonical-thresholds.
 */

import type { CanonicalEventName } from './canonical-events';

// ─────────────────────────────────────────────────────────────────────
// 1. Sub-layer types (Trigger / Message / Channel split)
// ─────────────────────────────────────────────────────────────────────

export type TriggerKind =
  | 'time_elapsed'        // e.g. quiz not completed after 30m
  | 'time_before_event'   // e.g. 24h before call
  | 'kpi_threshold_breach'// KPI below floor for N days
  | 'inactivity'          // no activity for N days
  | 'event_emitted'       // a canonical event fired
  | 'state_transition';   // user state machine change

export type MessagePurpose =
  | 'reminder' | 'reactivation' | 'urgency'
  | 'correction' | 'encouragement' | 'escalation';

export type DeliveryChannel =
  | 'email' | 'sms' | 'whatsapp'
  | 'in_app' | 'mentor_intervention' | 'admin_escalation';

export interface TriggerSpec {
  id: string;
  kind: TriggerKind;
  condition: string;            // human-readable predicate
  emits?: CanonicalEventName;   // canonical event reference if any
}

export interface MessageSpec {
  id: string;
  purpose: MessagePurpose;       // exactly one
  behavioral_target: string;     // single behavior we want
  primary_cta: string;           // exactly one CTA
}

export interface ChannelSpec {
  id: string;
  channel: DeliveryChannel;
  fallback?: DeliveryChannel;    // optional cascade (Lovable=brain, GHL=arms)
}

// ─────────────────────────────────────────────────────────────────────
// 2. Action engine — one primary action per communication
// ─────────────────────────────────────────────────────────────────────

export type ActionType =
  | 'book' | 'show_up' | 'complete_task' | 'review_call'
  | 'respond' | 'upgrade' | 're_engage' | 'escalate';

export interface ActionSpec {
  id: string;
  type: ActionType;
  success_condition: string;     // measurable
  failure_condition: string;     // measurable
  measurement_source:            // SoT
    | 'canonical_event'
    | 'get_kpi_truth'
    | 'state_transition';
}

// ─────────────────────────────────────────────────────────────────────
// 3. Performance measurement — every action must be measurable
// ─────────────────────────────────────────────────────────────────────

export interface MeasurementSpec {
  action_id: string;
  event_emitted?: CanonicalEventName;
  kpi_affected?: string;         // matches get_kpi_truth() key
  target_state: string;
  acceptable_range?: [number, number];
}

// ─────────────────────────────────────────────────────────────────────
// 4. Governance decision engine — fixed decision set, ignore is explicit
// ─────────────────────────────────────────────────────────────────────

export type GovernanceDecision =
  | 'prioritize' | 'reassign' | 'intervene'
  | 'escalate' | 'reinforce' | 'ignore';

export type SignalKind =
  | 'kpi_gap' | 'inactivity' | 'conversion_drop'
  | 'no_show' | 'non_compliance' | 'on_track';

export interface GovernanceRule {
  signal: SignalKind;
  decision: GovernanceDecision;
  rationale: string;
}

// ─────────────────────────────────────────────────────────────────────
// 5. Failure / Recovery engine — first-class
// ─────────────────────────────────────────────────────────────────────

export type FailureType =
  | 'no_response' | 'no_booking' | 'no_show'
  | 'task_not_completed' | 'kpi_below_threshold' | 'activity_drop';

export type RecoveryType =
  | 'reminder' | 'rescue_flow' | 'mentor_intervention'
  | 'director_escalation' | 'task_simplification' | 're_entry_path';

export interface RecoveryPath {
  failure: FailureType;
  recovery: RecoveryType;
  max_attempts: number;
  escalate_after_attempts: GovernanceDecision;
}

// ─────────────────────────────────────────────────────────────────────
// 6. Priority engine — one dominant next action at all times
// ─────────────────────────────────────────────────────────────────────

/** Lower number = higher priority. Tiebreakers applied in declared order. */
export const PRIORITY_DIMENSIONS = Object.freeze([
  'revenue_impact',        // 1
  'diagnosis_confidence',  // 2
  'urgency',               // 3
  'execution_speed',       // 4
] as const);
export type PriorityDimension = typeof PRIORITY_DIMENSIONS[number];

export interface PriorityScore {
  revenue_impact: number;       // 0..1
  diagnosis_confidence: number; // 0..1
  urgency: number;              // 0..1
  execution_speed: number;      // 0..1
}

/** Deterministic dominant-action picker. */
export function pickDominant<T extends { id: string; score: PriorityScore }>(
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    for (const dim of PRIORITY_DIMENSIONS) {
      const d = b.score[dim] - a.score[dim];
      if (d !== 0) return d;
    }
    return a.id.localeCompare(b.id); // stable tiebreaker
  })[0];
}

// ─────────────────────────────────────────────────────────────────────
// 7. Time layer — every loop component declares its horizon
// ─────────────────────────────────────────────────────────────────────

export type TimeHorizon = 'immediate' | 'short_term' | 'long_term';

export const TIME_HORIZON_BOUNDS: Record<TimeHorizon, { min_ms: number; max_ms: number }> = Object.freeze({
  immediate:  { min_ms: 0,                max_ms: 60 * 60 * 1000 },          // 0..1h
  short_term: { min_ms: 60 * 60 * 1000,   max_ms: 14 * 24 * 60 * 60 * 1000 }, // 1h..14d
  long_term:  { min_ms: 14 * 24 * 60 * 60 * 1000, max_ms: Number.POSITIVE_INFINITY },
});

// ─────────────────────────────────────────────────────────────────────
// 8. Loop modes — 4 canonical execution loops
// ─────────────────────────────────────────────────────────────────────

export type LoopMode = 'conversion' | 'retention' | 'recovery' | 'performance';

export interface ExecutionLoop {
  id: string;
  mode: LoopMode;
  trigger: TriggerSpec;
  message: MessageSpec;
  channel: ChannelSpec;
  action: ActionSpec;
  measurement: MeasurementSpec;
  governance: GovernanceRule;
  recovery: RecoveryPath;
  time_horizon: TimeHorizon;
  /** which 6-block components this loop touches */
  block_touchpoints: ReadonlyArray<
    'foundation' | 'acquisition' | 'conversion' | 'value' | 'intelligence' | 'governance'
  >;
}

// ─────────────────────────────────────────────────────────────────────
// 9. Canonical loop registry — initial seed (4 modes)
// ─────────────────────────────────────────────────────────────────────

export const EXECUTION_LOOPS: readonly ExecutionLoop[] = Object.freeze([
  // ── A. CONVERSION
  {
    id: 'LOOP_CONV_QUIZ_RESCUE',
    mode: 'conversion',
    trigger: { id: 'TRG_QUIZ_STALL_30M', kind: 'time_elapsed', condition: 'quiz_started AND NOT quiz_completed AFTER 30m' },
    message: { id: 'MSG_QUIZ_RESCUE', purpose: 'reminder', behavioral_target: 'finish_quiz', primary_cta: 'Resume your application' },
    channel: { id: 'CH_QUIZ_RESCUE', channel: 'email', fallback: 'sms' },
    action: { id: 'ACT_COMPLETE_QUIZ', type: 'complete_task', success_condition: 'quiz_completed event fired', failure_condition: 'no quiz_completed within 24h', measurement_source: 'canonical_event' },
    measurement: { action_id: 'ACT_COMPLETE_QUIZ', event_emitted: 'quiz_completed', target_state: 'QUIZ' },
    governance: { signal: 'inactivity', decision: 'reinforce', rationale: 'Single auto-nudge before reassign' },
    recovery: { failure: 'task_not_completed', recovery: 'rescue_flow', max_attempts: 2, escalate_after_attempts: 'ignore' },
    time_horizon: 'immediate',
    block_touchpoints: ['acquisition', 'foundation'],
  },
  {
    id: 'LOOP_CONV_BOOKING_TO_SHOW',
    mode: 'conversion',
    trigger: { id: 'TRG_T_MINUS_24H', kind: 'time_before_event', condition: 'appointment.starts_at - 24h' },
    message: { id: 'MSG_PRECALL_CONFIRM', purpose: 'reminder', behavioral_target: 'show_up_on_time', primary_cta: 'Confirm your call' },
    channel: { id: 'CH_PRECALL', channel: 'whatsapp', fallback: 'sms' },
    action: { id: 'ACT_SHOW_UP', type: 'show_up', success_condition: 'showed event fired', failure_condition: 'no_show event fired', measurement_source: 'canonical_event' },
    measurement: { action_id: 'ACT_SHOW_UP', event_emitted: 'showed', target_state: 'SHOWED' },
    governance: { signal: 'no_show', decision: 'intervene', rationale: 'Trigger no-show recovery sequence' },
    recovery: { failure: 'no_show', recovery: 'rescue_flow', max_attempts: 3, escalate_after_attempts: 'escalate' },
    time_horizon: 'short_term',
    block_touchpoints: ['conversion', 'acquisition'],
  },
  // ── B. RETENTION
  {
    id: 'LOOP_RET_DAILY_EXEC',
    mode: 'retention',
    trigger: { id: 'TRG_DAILY_TASK_OPEN', kind: 'inactivity', condition: 'no daily_execution event for 1 calendar day' },
    message: { id: 'MSG_DAILY_NUDGE', purpose: 'encouragement', behavioral_target: 'open_daily_execution_os', primary_cta: 'Open today\'s plan' },
    channel: { id: 'CH_DAILY', channel: 'in_app', fallback: 'email' },
    action: { id: 'ACT_COMPLETE_DAILY', type: 'complete_task', success_condition: 'daily_execution_completed within 24h', failure_condition: 'streak break >= 2d', measurement_source: 'get_kpi_truth' },
    measurement: { action_id: 'ACT_COMPLETE_DAILY', kpi_affected: 'consistency_score', target_state: 'streak_active' },
    governance: { signal: 'inactivity', decision: 'reinforce', rationale: 'Reinforce streak before mentor intervention' },
    recovery: { failure: 'activity_drop', recovery: 'mentor_intervention', max_attempts: 2, escalate_after_attempts: 'escalate' },
    time_horizon: 'short_term',
    block_touchpoints: ['value', 'intelligence'],
  },
  // ── C. RECOVERY
  {
    id: 'LOOP_REC_NO_SHOW_REBOOK',
    mode: 'recovery',
    trigger: { id: 'TRG_NO_SHOW_DETECTED', kind: 'event_emitted', condition: 'no_show emitted', emits: 'no_show' },
    message: { id: 'MSG_REBOOK', purpose: 'reactivation', behavioral_target: 'rebook_call', primary_cta: 'Pick a new slot' },
    channel: { id: 'CH_REBOOK', channel: 'whatsapp', fallback: 'email' },
    action: { id: 'ACT_REBOOK', type: 'book', success_condition: 'booked event fired (rebook)', failure_condition: 'no booked within 48h', measurement_source: 'canonical_event' },
    measurement: { action_id: 'ACT_REBOOK', event_emitted: 'booked', target_state: 'BOOKED' },
    governance: { signal: 'no_show', decision: 'intervene', rationale: 'Recovery owns this signal until exhausted' },
    recovery: { failure: 'no_booking', recovery: 're_entry_path', max_attempts: 2, escalate_after_attempts: 'ignore' },
    time_horizon: 'short_term',
    block_touchpoints: ['conversion', 'governance'],
  },
  // ── D. PERFORMANCE
  {
    id: 'LOOP_PERF_KPI_GAP_FEEDBACK',
    mode: 'performance',
    trigger: { id: 'TRG_KPI_GAP_3D', kind: 'kpi_threshold_breach', condition: 'KPI below floor for 3 consecutive days' },
    message: { id: 'MSG_PERF_FEEDBACK', purpose: 'correction', behavioral_target: 'execute_targeted_task', primary_cta: 'Open your improvement task' },
    channel: { id: 'CH_PERF', channel: 'in_app', fallback: 'mentor_intervention' },
    action: { id: 'ACT_REVIEW_AND_TASK', type: 'review_call', success_condition: 'KPI returns to acceptable_range within 7d', failure_condition: 'KPI gap persists 7d+', measurement_source: 'get_kpi_truth' },
    measurement: { action_id: 'ACT_REVIEW_AND_TASK', kpi_affected: 'close_rate', target_state: 'within_floor' },
    governance: { signal: 'kpi_gap', decision: 'intervene', rationale: 'Bottleneck Control Engine selects single dominant lever' },
    recovery: { failure: 'kpi_below_threshold', recovery: 'mentor_intervention', max_attempts: 2, escalate_after_attempts: 'escalate' },
    time_horizon: 'long_term',
    block_touchpoints: ['intelligence', 'governance', 'value'],
  },
]);

// ─────────────────────────────────────────────────────────────────────
// 10. Validators — completeness gates per Execution Loop v2 spec
// ─────────────────────────────────────────────────────────────────────

export interface LoopViolation { loopId: string; rule: string; detail: string }

/** Every loop must satisfy the seven invariants of the Final Constitutional Test. */
export function auditExecutionLoops(loops: readonly ExecutionLoop[] = EXECUTION_LOOPS): {
  passed: boolean; total: number; violations: LoopViolation[];
} {
  const v: LoopViolation[] = [];
  for (const l of loops) {
    if (!l.trigger?.condition) v.push({ loopId: l.id, rule: 'trigger_required', detail: 'Missing trigger condition' });
    if (!l.message?.primary_cta) v.push({ loopId: l.id, rule: 'one_cta', detail: 'Message must have exactly one primary_cta' });
    if (!l.action?.measurement_source) v.push({ loopId: l.id, rule: 'measurement_required', detail: 'Action must declare measurement_source' });
    if (!l.measurement || (!l.measurement.event_emitted && !l.measurement.kpi_affected)) {
      v.push({ loopId: l.id, rule: 'measurable', detail: 'Measurement must reference event or KPI' });
    }
    if (!l.governance?.decision) v.push({ loopId: l.id, rule: 'explicit_decision', detail: 'Governance decision must be explicit (incl. ignore)' });
    if (!l.recovery?.recovery) v.push({ loopId: l.id, rule: 'recovery_required', detail: 'Failure must map to a recovery path' });
    if (!l.time_horizon) v.push({ loopId: l.id, rule: 'time_horizon_required', detail: 'Loop must declare a time horizon' });
  }
  return { passed: v.length === 0, total: loops.length, violations: v };
}
