/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL SELF-OPTIMIZATION ENGINE — Layer 36 (Phase 2: Autonomous Mode)
 * ───────────────────────────────────────────────────────────────────────
 * EXTENDS Phase 1 (canonical-self-optimization.ts). Does NOT replace it.
 *
 * Adds:
 *  • 3-mode model (passive | assisted | autonomous) per module + per funnel
 *  • Auto-apply path for low-risk, high-confidence optimization rules
 *  • Measurement windows + post-window impact verdicts
 *  • Auto-rollback on harmful changes
 *  • Hard module allow/deny lists for autonomous execution
 *
 * Storage extensions (additive only):
 *  • self_optimization_settings.autonomy_config       jsonb (new)
 *  • self_optimization_settings.auto_rollback_enabled bool  (new)
 *  • self_optimization_proposals.auto_applied         bool  (new)
 *  • self_optimization_proposals.measurement_window_h int   (new)
 *  • self_optimization_proposals.measured_at          ts    (new)
 *  • self_optimization_proposals.actual_impact_pct    num   (new)
 *  • self_optimization_proposals.verdict              text  (new) successful|neutral|failed
 *  • self_optimization_proposals.rolled_back_at       ts    (new)
 *  • self_optimization_proposals.rollback_reason      text  (new)
 *  • per_funnel_autonomy_modes (new table — per funnel/module mode)
 *
 * Constitutional guarantees:
 *  • Autonomous changes ONLY through canAutoApplyV2() chokepoint
 *  • Every auto-apply writes change_audit_log + config_versions (Layer 37)
 *  • Forbidden modules are HARDCODED — cannot be enabled by config
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { SelfOptRuleId, SelfOptMode } from './canonical-self-optimization';

/** Phase 2 introduces a 3rd mode. */
export type SelfOptModeV2 = 'passive' | 'assisted' | 'autonomous';

/** Modules autonomy can touch. */
export type AutonomousModule =
  | 'message_variant'
  | 'message_traffic_split'
  | 'touchpoint_timing'
  | 'channel_priority'
  | 'ai_setter_script_allocation'
  | 'attendance_reminder_intensity'
  | 'high_value_lead_priority'
  | 'escalation_thresholds';

/** HARDCODED — cannot be unlocked by config. Constitutional. */
export const FORBIDDEN_AUTONOMOUS_MODULES = Object.freeze([
  'pricing',
  'legal_copy',
  'payment_flows',
  'qualification_logic',
  'refund_logic',
  'income_claims',
  'global_funnel_structure',
  'full_ai_closing',
  'sensitive_user_fields',
] as const);

export type ForbiddenAutonomousModule = (typeof FORBIDDEN_AUTONOMOUS_MODULES)[number];

export const AUTONOMOUS_MODULES: readonly { id: AutonomousModule; rule: SelfOptRuleId; label: string; risk: 'low' | 'medium' }[] = Object.freeze([
  { id: 'message_variant',                 rule: 'R1_message_optimization',     label: 'Message Variant Winner',         risk: 'low' },
  { id: 'message_traffic_split',           rule: 'R1_message_optimization',     label: 'Message Traffic Split',          risk: 'low' },
  { id: 'channel_priority',                rule: 'R2_channel_prioritization',   label: 'Channel Priority',               risk: 'low' },
  { id: 'touchpoint_timing',               rule: 'R3_timing_adjustment',        label: 'Touchpoint Timing (small)',      risk: 'low' },
  { id: 'ai_setter_script_allocation',     rule: 'R4_ai_script_optimization',   label: 'AI Setter Script Allocation',    risk: 'medium' },
  { id: 'attendance_reminder_intensity',   rule: 'R5_noshow_reduction',         label: 'Attendance Reminder Intensity',  risk: 'low' },
  { id: 'high_value_lead_priority',        rule: 'R6_high_value_priority',      label: 'High-Value Lead Prioritization', risk: 'low' },
  { id: 'escalation_thresholds',           rule: 'R7_escalation',               label: 'Escalation Thresholds',          risk: 'low' },
]);

/** Hard guardrails an admin can tighten but never loosen past the cap. */
export interface AutonomyGuardrails {
  max_traffic_shift_pct_per_cycle: number; // hard cap 30
  max_timing_shift_minutes: number;        // hard cap 5
  max_timing_shift_hours: number;          // hard cap 1
  max_timing_shift_days: number;           // hard cap 1
  min_sample_size: number;                 // floor 50
  min_confidence: number;                  // floor 0.80
  max_messages_per_24h: number;            // hard cap 3
  max_calls_per_lead: number;              // hard cap 3
  quiet_hours_start: string;               // "21:00"
  quiet_hours_end: string;                 // "08:00"
  l6_may_enable_autonomous: boolean;       // admin toggle
}

export const DEFAULT_AUTONOMY_GUARDRAILS: Readonly<AutonomyGuardrails> = Object.freeze({
  max_traffic_shift_pct_per_cycle: 20,
  max_timing_shift_minutes: 5,
  max_timing_shift_hours: 1,
  max_timing_shift_days: 1,
  min_sample_size: 100,
  min_confidence: 0.85,
  max_messages_per_24h: 3,
  max_calls_per_lead: 3,
  quiet_hours_start: '21:00',
  quiet_hours_end: '08:00',
  l6_may_enable_autonomous: false,
});

/** Constitutional caps — guardrails may be SET tighter than these but never looser. */
export const HARD_CAPS: Readonly<Pick<AutonomyGuardrails,
  'max_traffic_shift_pct_per_cycle' | 'max_timing_shift_minutes' | 'max_timing_shift_hours' |
  'max_timing_shift_days' | 'max_messages_per_24h' | 'max_calls_per_lead'>> = Object.freeze({
  max_traffic_shift_pct_per_cycle: 30,
  max_timing_shift_minutes: 5,
  max_timing_shift_hours: 1,
  max_timing_shift_days: 1,
  max_messages_per_24h: 3,
  max_calls_per_lead: 3,
});

/** Measurement window per module type (hours). */
export const MEASUREMENT_WINDOWS_HOURS: Readonly<Record<AutonomousModule, number>> = Object.freeze({
  message_variant: 48,
  message_traffic_split: 48,
  touchpoint_timing: 72,
  channel_priority: 72,
  ai_setter_script_allocation: 168,        // 7d
  attendance_reminder_intensity: 168,      // 7d
  high_value_lead_priority: 24,
  escalation_thresholds: 168,
});

/** Auto-rollback triggers (verdict-based, after measurement window closes). */
export interface AutoRollbackTriggers {
  conversion_drop_pct: number;        // 15
  unsubscribe_spike_pct: number;      // configurable per admin
  failed_send_spike_pct: number;
  noshow_increase_pct: number;
  negative_reply_spike_pct: number;
}

export const DEFAULT_AUTO_ROLLBACK: Readonly<AutoRollbackTriggers> = Object.freeze({
  conversion_drop_pct: 15,
  unsubscribe_spike_pct: 10,
  failed_send_spike_pct: 25,
  noshow_increase_pct: 10,
  negative_reply_spike_pct: 15,
});

/** Verdict after measurement window. */
export type ImpactVerdict = 'successful' | 'neutral' | 'failed' | 'pending';

/** Per-funnel + per-module mode resolution. */
export interface AutonomyModeRow {
  funnel_key: string;
  module: AutonomousModule;
  mode: SelfOptModeV2;
  enabled_by: string | null;
  enabled_at: string | null;
}

/**
 * Single chokepoint — Phase 2 auto-apply gate.
 * Returns true ONLY if all of the following are true:
 *  1. Module is in AUTONOMOUS_MODULES (not forbidden)
 *  2. Mode resolution = 'autonomous'
 *  3. Sample/confidence/lift thresholds met
 *  4. Guardrail caps respected
 *  5. Not in quiet hours (for outbound-impacting changes)
 */
export function canAutoApplyV2(input: {
  module: AutonomousModule;
  mode: SelfOptModeV2;
  sample_size: number;
  confidence: number;
  lift_pct: number;
  proposed_traffic_shift_pct?: number;
  proposed_timing_shift_minutes?: number;
  guardrails: AutonomyGuardrails;
  now?: Date;
}): { ok: boolean; reason?: string } {
  const { module, mode, sample_size, confidence, lift_pct, guardrails } = input;

  if (mode !== 'autonomous') return { ok: false, reason: 'mode_not_autonomous' };

  if (!AUTONOMOUS_MODULES.find((m) => m.id === module)) {
    return { ok: false, reason: 'module_not_eligible' };
  }

  if (sample_size < Math.max(guardrails.min_sample_size, 50)) {
    return { ok: false, reason: 'sample_size_too_low' };
  }
  if (confidence < Math.max(guardrails.min_confidence, 0.8)) {
    return { ok: false, reason: 'confidence_too_low' };
  }
  if (lift_pct < 10) return { ok: false, reason: 'lift_too_low' };

  if (
    input.proposed_traffic_shift_pct != null &&
    input.proposed_traffic_shift_pct > Math.min(guardrails.max_traffic_shift_pct_per_cycle, HARD_CAPS.max_traffic_shift_pct_per_cycle)
  ) {
    return { ok: false, reason: 'traffic_shift_exceeds_cap' };
  }
  if (
    input.proposed_timing_shift_minutes != null &&
    Math.abs(input.proposed_timing_shift_minutes) > Math.min(guardrails.max_timing_shift_minutes, HARD_CAPS.max_timing_shift_minutes)
  ) {
    return { ok: false, reason: 'timing_shift_exceeds_cap' };
  }

  // Quiet hours guard — only blocks outbound-impacting modules
  const outboundImpacting: AutonomousModule[] = [
    'message_variant', 'message_traffic_split', 'channel_priority',
    'touchpoint_timing', 'ai_setter_script_allocation', 'attendance_reminder_intensity',
  ];
  if (outboundImpacting.includes(module)) {
    const now = input.now ?? new Date();
    const hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (inQuietHours(hh, guardrails.quiet_hours_start, guardrails.quiet_hours_end)) {
      return { ok: false, reason: 'quiet_hours' };
    }
  }

  return { ok: true };
}

function inQuietHours(now: string, start: string, end: string): boolean {
  // start/end like "21:00" / "08:00", may wrap midnight
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // wraps
}

/**
 * Verdict resolver — call after measurement window closes.
 * Returns the verdict + whether auto-rollback should fire.
 */
export function resolveVerdict(input: {
  baseline_metric: number;
  observed_metric: number;
  unsubscribe_delta_pct?: number;
  failed_send_delta_pct?: number;
  noshow_delta_pct?: number;
  negative_reply_delta_pct?: number;
  triggers: AutoRollbackTriggers;
}): { verdict: ImpactVerdict; should_rollback: boolean; reason?: string } {
  const { baseline_metric, observed_metric, triggers } = input;
  if (baseline_metric <= 0) return { verdict: 'neutral', should_rollback: false };

  const deltaPct = ((observed_metric - baseline_metric) / baseline_metric) * 100;

  // Negative-impact rollback triggers
  if (deltaPct <= -triggers.conversion_drop_pct) {
    return { verdict: 'failed', should_rollback: true, reason: `conversion_drop_${deltaPct.toFixed(1)}pct` };
  }
  if ((input.unsubscribe_delta_pct ?? 0) >= triggers.unsubscribe_spike_pct) {
    return { verdict: 'failed', should_rollback: true, reason: 'unsubscribe_spike' };
  }
  if ((input.failed_send_delta_pct ?? 0) >= triggers.failed_send_spike_pct) {
    return { verdict: 'failed', should_rollback: true, reason: 'failed_send_spike' };
  }
  if ((input.noshow_delta_pct ?? 0) >= triggers.noshow_increase_pct) {
    return { verdict: 'failed', should_rollback: true, reason: 'noshow_increase' };
  }
  if ((input.negative_reply_delta_pct ?? 0) >= triggers.negative_reply_spike_pct) {
    return { verdict: 'failed', should_rollback: true, reason: 'negative_reply_spike' };
  }

  if (deltaPct >= 5) return { verdict: 'successful', should_rollback: false };
  return { verdict: 'neutral', should_rollback: false };
}

/** Risk score 0-100 for UI display + audit metadata. */
export function computeRiskScore(input: {
  module: AutonomousModule;
  proposed_traffic_shift_pct?: number;
  proposed_timing_shift_minutes?: number;
  sample_size: number;
  confidence: number;
}): number {
  const moduleRisk = AUTONOMOUS_MODULES.find((m) => m.id === input.module)?.risk === 'medium' ? 30 : 10;
  const shiftRisk = input.proposed_traffic_shift_pct ? Math.min(30, input.proposed_traffic_shift_pct) : 0;
  const timingRisk = input.proposed_timing_shift_minutes ? Math.min(15, Math.abs(input.proposed_timing_shift_minutes) * 2) : 0;
  const sampleBoost = input.sample_size >= 200 ? -10 : 0;
  const confidenceBoost = input.confidence >= 0.9 ? -10 : 0;
  return Math.max(0, Math.min(100, moduleRisk + shiftRisk + timingRisk + sampleBoost + confidenceBoost));
}

/** Re-export Phase 1 mode for compatibility. */
export type { SelfOptMode };
