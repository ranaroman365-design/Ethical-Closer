/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANON MAP — Post-Consolidation v2
 * Single machine-readable inventory of active canons (21 total).
 * Source of truth for tooling, admin diagnostics, and MECE validation.
 * Spec: docs/canon-consolidation-v2.md
 * ═══════════════════════════════════════════════════════════════════════
 */

export type CanonBlock =
  | 'foundation' | 'acquisition' | 'conversion'
  | 'value' | 'intelligence' | 'governance'
  | 'meta';

export interface CanonEntry {
  id: string;
  name: string;
  block: CanonBlock;
  source: string;          // file or memory path
  absorbed?: string[];     // canon ids merged into this one
  status: 'active' | 'dormant';
}

export const CANON_MAP: readonly CanonEntry[] = Object.freeze([
  // ─ Foundation
  { id: 'F1', name: 'Canonical Role Naming',     block: 'foundation', source: 'src/lib/canonical-roles.ts',      status: 'active' },
  { id: 'F2', name: 'Operational Canon',         block: 'foundation', source: 'src/lib/operational-canon.ts',    status: 'active' },
  { id: 'F3', name: 'Canonical Thresholds',      block: 'foundation', source: 'src/lib/canonical-thresholds.ts', status: 'active' },
  { id: 'F4', name: 'Canonical Events Registry', block: 'foundation', source: 'src/lib/canonical-events.ts',     status: 'active' },
  { id: 'F5', name: 'Multi-Tenant Room Scoping', block: 'foundation', source: 'mem://technical/multi-tenant-room-scoping', status: 'active' },
  { id: 'F6', name: 'Event Idempotency',         block: 'foundation', source: 'mem://technical/event-idempotency-and-hygiene', status: 'active' },
  { id: 'F7', name: 'Unified Message Library (Layer 31)', block: 'foundation', source: 'src/lib/canonical-message-library.ts', status: 'active' },
  { id: 'F8', name: 'Communication Canon (Layer 45 — FINAL)', block: 'foundation', source: 'src/lib/canonical-communication.ts — meta-canon governing C1/C4/C5/C6/C7/C8/C11/F7/G6: queue-only sends, strict channel roles (conversion/reengagement/documentation), 8 pre-send checks, dashboard never sends', status: 'active' },

  // ─ Acquisition
  { id: 'A1', name: 'Narrative Stack (Narrative+Emotion+Charisma+Lifestyle)', block: 'acquisition', source: 'src/lib/canonical-narrative.ts', status: 'active' },
  { id: 'A2', name: 'Lead Routing Canon', block: 'acquisition', source: 'src/lib/smart-routing.ts + canonical-thresholds.ROUTING', absorbed: ['C29','C37','C46'], status: 'active' },
  { id: 'A3', name: 'Booking Conversion Logic v20', block: 'acquisition', source: 'mem://features/booking-conversion-logic-v20', status: 'active' },

  // ─ Conversion
  { id: 'C1', name: 'Communication Delivery Canon', block: 'conversion', source: 'src/lib/canonical-events.ts + outbound_events', absorbed: ['C30','C31'], status: 'active' },
  { id: 'C2', name: 'Operator Workflow Canon',      block: 'conversion', source: 'mem://features/daily-execution-os-v2-master',    absorbed: ['C43','C44','C50'], status: 'active' },
  { id: 'C3', name: 'Appointment Recovery & Reschedule', block: 'conversion', source: 'mem://features/appointment-recovery-and-reschedule', status: 'active' },
  { id: 'C4', name: 'Canonical Attendance OS (Layer 27)', block: 'conversion', source: 'src/lib/canonical-attendance.ts', status: 'active' },
  { id: 'C5', name: 'Canonical AI Setter Voice (Layer 28)', block: 'conversion', source: 'src/lib/canonical-ai-setter.ts', status: 'active' },
  { id: 'C6', name: 'Lead Activation Touchpoints (Layer 29)', block: 'conversion', source: 'src/lib/canonical-lead-activation.ts', status: 'active' },
  { id: 'C7', name: 'Level-Based Messaging Engine (Layer 30)', block: 'conversion', source: 'src/lib/canonical-level-messaging.ts', status: 'active' },
  { id: 'C8', name: 'Conversational WhatsApp AI (Layer 38)', block: 'conversion', source: 'src/lib/canonical-conversational-ai.ts + conversational_ai_settings/conversations/messages/escalations + conversational-ai-respond edge fn', status: 'active' },
  { id: 'C9', name: 'Psychological State Engine (Layer 39)', block: 'conversion', source: 'src/lib/canonical-psych-state.ts + wa_conversations.psych_state* + wa_psych_state_events + psych_state_performance() RPC', status: 'active' },
  { id: 'C10', name: 'Personality Matching Engine (Layer 40)', block: 'conversion', source: 'src/lib/canonical-personality.ts + wa_conversations.personality_* + wa_personality_events + personality_performance() RPC + 16 wa_p_* templates', status: 'active' },

  // ─ Value
  { id: 'V1', name: 'Canonical Onboarding',   block: 'value', source: 'mem://architecture/canonical-onboarding',   status: 'active' },
  { id: 'V2', name: 'Canonical Progression',  block: 'value', source: 'mem://architecture/canonical-progression',  status: 'active' },
  { id: 'V3', name: 'Canonical Mentoring',    block: 'value', source: 'mem://architecture/canonical-mentoring',    status: 'active' },
  { id: 'V4', name: 'Canonical Compensation', block: 'value', source: 'mem://architecture/canonical-compensation', status: 'active' },

  // ─ Intelligence
  { id: 'I1', name: 'KPI Truth Layer',           block: 'intelligence', source: 'rpc:get_kpi_truth + operational-canon + canonical-thresholds', absorbed: ['C07','C13-kpi','C40'], status: 'active' },
  { id: 'I2', name: 'OSS + PSP Coherence Layer', block: 'intelligence', source: 'mem://architecture/operator-economy-coherence-layer', status: 'active' },
  { id: 'I3', name: 'Control Engine — Bottleneck', block: 'intelligence', source: 'mem://architecture/control-engine-bottleneck-system', status: 'active' },
  { id: 'I4', name: 'Message Performance System (Layer 32)', block: 'intelligence', source: 'src/lib/canonical-message-performance.ts + message_performance_events/stats/ab_decisions', status: 'active' },
  { id: 'I5', name: 'Voice Performance System (Layer 33)', block: 'intelligence', source: 'src/lib/canonical-voice-performance.ts + call_performance_events/stats/intent_analysis/script_variants/ab_decisions', status: 'active' },
  { id: 'I6', name: 'Full Funnel Intelligence (Layer 34)', block: 'intelligence', source: 'src/lib/canonical-funnel-intelligence.ts + funnel_metrics_daily/performance_aggregates/insight_findings + funnel_intelligence_view RPC', status: 'active' },

  // ─ Governance
  { id: 'G1', name: 'Performance Surface Canon', block: 'governance', source: 'operational-canon.ACCESS_MATRIX', absorbed: ['C08','C48','C56'], status: 'active' },
  { id: 'G2', name: 'Canonical B2B (SPaaS)',     block: 'governance', source: 'mem://architecture/canonical-b2b', status: 'active' },
  { id: 'G3', name: 'Canonical System Architecture (Layer 35)', block: 'governance', source: 'src/lib/canonical-system-architecture.ts', status: 'active' },
  { id: 'G4', name: 'Operator Control Engine (Layer 33)', block: 'governance', source: 'src/lib/canonical-operator-control.ts + per_funnel_feature_flags/lead_next_best_action/lead_sequence_locks/operator_escalations/operator_control_audit + operator_control_view RPC', status: 'active' },

  // ─ Acquisition
  { id: 'A1', name: 'Lead Lifecycle Touchpoints (Layer 26)', block: 'acquisition', source: 'src/lib/canonical-lead-lifecycle.ts + lifecycle_touchpoint_jobs', status: 'active' },

  // ─ Intelligence (Self-Learning)
  { id: 'I7', name: 'Self-Optimization Engine — Phase 1 (Layer 36)', block: 'intelligence', source: 'src/lib/canonical-self-optimization.ts + self_optimization_settings/proposals/logs', status: 'active' },
  { id: 'I8', name: 'Self-Optimization Engine — Phase 2 Autonomous (Layer 36 v2)', block: 'intelligence', source: 'src/lib/canonical-self-optimization-v2.ts + per_funnel_autonomy_modes + self_opt_rollback_proposal/self_opt_effective_mode RPCs', status: 'active' },
  { id: 'I9', name: 'Sales Brain — Pre-Call Intelligence (Layer 41)', block: 'intelligence', source: 'src/lib/canonical-sales-brain.ts + lead_sales_profiles/pre_call_insights/post_call_analyses/objection_intelligence + sales_brain_lead_view RPC + sales-brain-precall/postcall edge fns', status: 'active' },
  { id: 'I10', name: 'Learning Feedback Loop (Layer 42)', block: 'intelligence', source: 'src/lib/canonical-learning-loop.ts + learning_loop_settings/learning_data_pool/learning_insights/training_content_updates + approve_learning_pool_entry/reject_learning_pool_entry/learning_pool_for_student RPCs + learning-loop-ingest/insight edge fns', status: 'active' },

  // ─ Governance (Audit & Versioning)
  { id: 'G5', name: 'Audit · Versioning · Reporting (Layer 37)', block: 'governance', source: 'src/lib/canonical-audit-versioning.ts + change_audit_log/config_versions/optimization_reports + restore_config_version RPC + optimization-report-generate edge fn', status: 'active' },
  { id: 'G6', name: 'Email Documentation Layer (Layer 43)', block: 'governance', source: 'src/lib/canonical-email-documentation.ts + email_documentation_settings/log + email-documentation-dispatch edge fn', status: 'active' },
  { id: 'C11', name: 'Push Notification Channel (Layer 44)', block: 'conversion', source: 'src/lib/canonical-push.ts + push_settings/subscriptions/notifications + push-dispatch edge fn + public/push-sw.js', status: 'active' },

  // ─ Meta (system shape over all blocks)
  { id: 'M1', name: 'ETC Operating System™ (Layer 47, SUPREME)', block: 'meta', source: 'src/lib/etc-operating-system.ts + docs/etc-operating-system.md — defines 4 layers (Revenue/Talent/Intelligence/Visualization) + 3 dashboards (Revenue Flow Map / Talent Flow Map / Intelligence Control) + unified Supabase data pool + connection logic + audit gate auditOperatingSystem()', status: 'active' },
]);

/** Demoted to feature/UI spec — no longer canon-level. */
export const DEMOTED = Object.freeze([
  { id: 'C58', name: 'Mission Section Design',          newType: 'ui-spec' },
  { id: 'C63', name: 'Communication System v8',         newType: 'feature-spec' },
  { id: 'C61', name: 'Operator Comparison Dashboard',   newType: 'feature-spec' },
  { id: 'C43', name: 'Closing Script Philosophy',       newType: 'feature-spec (under C2)' },
  { id: 'C54', name: 'Employer Marketplace',            newType: 'dormant-feature-spec' },
] as const);

/** Quick MECE check: every canon belongs to exactly one block. */
export function canonsByBlock(): Record<CanonBlock, CanonEntry[]> {
  return CANON_MAP.reduce((acc, c) => {
    (acc[c.block] ||= []).push(c);
    return acc;
  }, {} as Record<CanonBlock, CanonEntry[]>);
}
