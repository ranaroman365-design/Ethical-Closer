/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL SELF-OPTIMIZATION ENGINE — Layer 36 (Phase 1: Assisted Mode)
 * ───────────────────────────────────────────────────────────────────────
 * Closed-loop assisted self-learning. Proposes small, safe, high-impact
 * changes. L6/admin must approve before any change is applied. Every
 * change (proposed, approved, rejected, applied) is logged.
 *
 * MODES
 *   - assisted   (default — propose only, never auto-apply)
 *   - autonomous (Phase 2 — NOT enabled in this layer)
 *
 * RULES (10)
 *   R1  message_optimization        — variant B beats A by ≥15% & n≥50 → shift 70/30
 *   R2  channel_prioritization      — WhatsApp reply > SMS by ≥20% → prioritize WhatsApp
 *   R3  timing_adjustment           — small ±5min shifts only
 *   R4  ai_script_optimization      — script B booking > A by ≥10% → 60/40
 *   R5  noshow_reduction            — show_rate < 60% → add T-2h reminder
 *   R6  high_value_priority         — high lead_score & no booking after 2h → AI Setter queue
 *   R7  escalation                  — unknown/angry reply → human
 *   R8  cooldown                    — max 3 messages / 24h per lead
 *   R9  call_attempt_cap            — max 3 call attempts
 *   R10 negative_response_pause     — pause all automation on negative response
 *
 * GUARDRAILS
 *   - no large changes (max ±5min timing, max ±20% traffic shift per cycle)
 *   - no new message creation by AI (library-only)
 *   - no full funnel rewriting
 *   - no full AI closing
 *   - L6 override at every step
 *
 * STORAGE
 *   - self_optimization_settings   (mode, thresholds, enabled)
 *   - self_optimization_proposals  (queue: pending/approved/rejected/applied)
 *   - self_optimization_logs       (immutable: what/why/before/after)
 * ═══════════════════════════════════════════════════════════════════════
 */

export type SelfOptMode = 'assisted' | 'autonomous';

export type SelfOptRuleId =
  | 'R1_message_optimization'
  | 'R2_channel_prioritization'
  | 'R3_timing_adjustment'
  | 'R4_ai_script_optimization'
  | 'R5_noshow_reduction'
  | 'R6_high_value_priority'
  | 'R7_escalation'
  | 'R8_cooldown'
  | 'R9_call_attempt_cap'
  | 'R10_negative_response_pause';

export type SelfOptProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'expired';

export interface SelfOptThresholds {
  // R1 message optimization
  message_min_lift_pct: number;       // 15
  message_min_sample_size: number;    // 50
  message_traffic_shift_pct: number;  // 70

  // R2 channel
  channel_min_lift_pct: number;       // 20

  // R3 timing
  timing_max_shift_min: number;       // 5

  // R4 ai script
  script_min_lift_pct: number;        // 10
  script_traffic_shift_pct: number;   // 60

  // R5 no-show
  noshow_min_show_rate_pct: number;   // 60
  noshow_extra_reminder_hours: number;// 2

  // R6 high-value
  highvalue_lead_score_min: number;   // 70
  highvalue_wait_hours: number;       // 2

  // R8 cooldown
  cooldown_max_messages_24h: number;  // 3

  // R9 call cap
  max_call_attempts: number;          // 3
}

export const DEFAULT_THRESHOLDS: Readonly<SelfOptThresholds> = Object.freeze({
  message_min_lift_pct: 15,
  message_min_sample_size: 50,
  message_traffic_shift_pct: 70,
  channel_min_lift_pct: 20,
  timing_max_shift_min: 5,
  script_min_lift_pct: 10,
  script_traffic_shift_pct: 60,
  noshow_min_show_rate_pct: 60,
  noshow_extra_reminder_hours: 2,
  highvalue_lead_score_min: 70,
  highvalue_wait_hours: 2,
  cooldown_max_messages_24h: 3,
  max_call_attempts: 3,
});

export interface SelfOptRule {
  id: SelfOptRuleId;
  name: string;
  category: 'optimization' | 'safety' | 'escalation';
  risk: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  description: string;
  requires_approval: boolean; // true in assisted mode for ALL optimization rules
}

export const SELF_OPT_RULES: readonly SelfOptRule[] = Object.freeze([
  { id: 'R1_message_optimization',   name: 'Message A/B Optimization',     category: 'optimization', risk: 'low',    impact: 'high',   description: 'Shift traffic to better-performing message variant after lift + sample threshold.', requires_approval: true },
  { id: 'R2_channel_prioritization', name: 'Channel Prioritization',       category: 'optimization', risk: 'low',    impact: 'high',   description: 'Prioritize channel with higher reply rate; weaker channel becomes fallback.',         requires_approval: true },
  { id: 'R3_timing_adjustment',      name: 'Timing Adjustment (±5min)',    category: 'optimization', risk: 'low',    impact: 'medium', description: 'Small ±5min shifts on underperforming touchpoints.',                                requires_approval: true },
  { id: 'R4_ai_script_optimization', name: 'AI Setter Script Optimization',category: 'optimization', risk: 'low',    impact: 'high',   description: 'Shift voice script weight to better-converting variant.',                          requires_approval: true },
  { id: 'R5_noshow_reduction',       name: 'No-Show Reduction',            category: 'optimization', risk: 'low',    impact: 'high',   description: 'Add T-2h reminder when show rate falls below threshold.',                          requires_approval: true },
  { id: 'R6_high_value_priority',    name: 'High-Value Lead Priority',     category: 'optimization', risk: 'low',    impact: 'high',   description: 'Route high-score leads without booking after 2h to AI Setter queue.',              requires_approval: true },
  { id: 'R7_escalation',             name: 'Negative/Unknown Reply Escalation', category: 'escalation', risk: 'low', impact: 'high',  description: 'Escalate to human on angry or unrecognized replies.',                              requires_approval: false },
  { id: 'R8_cooldown',               name: 'Cooldown (max 3 / 24h)',       category: 'safety',       risk: 'low',    impact: 'high',   description: 'Hard cap of 3 outbound messages per lead per 24h.',                                requires_approval: false },
  { id: 'R9_call_attempt_cap',       name: 'Call Attempt Cap (3)',         category: 'safety',       risk: 'low',    impact: 'medium', description: 'Hard cap of 3 AI Setter call attempts per lead.',                                  requires_approval: false },
  { id: 'R10_negative_response_pause', name: 'Auto-Pause on Negative Reply', category: 'safety',     risk: 'low',    impact: 'high',   description: 'Pause all automation for a lead after a negative response.',                       requires_approval: false },
]);

/** Forbidden — Phase 2 / never. Blocks runaway automation. */
export const FORBIDDEN_AUTOMATIONS = Object.freeze([
  'full_ai_closing',
  'aggressive_timing_changes',
  'ai_message_creation',
  'full_funnel_rewriting',
] as const);

/** Single chokepoint to evaluate whether a proposal may be auto-applied. */
export function canAutoApply(rule: SelfOptRuleId, mode: SelfOptMode): boolean {
  const r = SELF_OPT_RULES.find((x) => x.id === rule);
  if (!r) return false;
  // Safety + escalation rules apply directly (they are guardrails, not changes)
  if (r.category === 'safety' || r.category === 'escalation') return true;
  // Optimization rules NEVER auto-apply in assisted mode
  return mode === 'autonomous' && !r.requires_approval;
}

export function ruleById(id: SelfOptRuleId): SelfOptRule | undefined {
  return SELF_OPT_RULES.find((r) => r.id === id);
}
