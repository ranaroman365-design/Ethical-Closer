/**
 * Layer 33 — Operator Control Engine (Cockpit Canon)
 *
 * Constitutional position:
 *   Block:        Governance (primary) + Conversion + Intelligence
 *   Governing:    Canon Constitution v1
 *   Composes:     L26 (Lead Lifecycle), L27 (Smart Attendance),
 *                 L28 (AI Setter), L29/30 (Level Messaging),
 *                 L31 (Message Library), L32 (Funnel Intelligence).
 *   Does NOT:     send messages, place calls, mutate KPIs.
 *                 It is a CONTROL surface — pure read + flag toggles +
 *                 manual NBA confirm.
 *
 * Purpose:
 *   Single cockpit for L6 Senior Closers (and admins) that answers:
 *     1. What is happening?    (Status)
 *     2. What needs attention? (Escalations)
 *     3. What is automated?    (Active flags + sequences)
 *     4. What should I do next?(Next Best Action queue)
 *
 * Hard rules:
 *   1. One lead = one owner = one active sequence = one NBA. Enforced by
 *      lead_sequence_locks + collision-prevention preflight.
 *   2. L6 sees ONLY funnels they own. Admin sees all. Lower levels: 403.
 *   3. NBA never auto-executes. Operator must Approve or Skip.
 *   4. All flag changes are audited (operator_control_audit).
 *   5. Emergency shutdown: admin-only, sets all *_enabled=false in one tx.
 */

export const OPERATOR_CONTROL_LAYER_ID = 33 as const;

export const FEATURE_FLAGS = [
  "smart_attendance_enabled",
  "ai_setter_enabled",
  "lead_lifecycle_enabled",
  "level_messaging_enabled",
  "test_mode",
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  smart_attendance_enabled: false,
  ai_setter_enabled: false,
  lead_lifecycle_enabled: false,
  level_messaging_enabled: false,
  test_mode: true,
};

/** The five — and only — actions the cockpit can recommend. */
export const NBA_ACTIONS = [
  "send_message",
  "send_booking_link",
  "call_ai_setter",
  "assign_human",
  "wait",
  "escalate",
] as const;
export type NbaAction = (typeof NBA_ACTIONS)[number];

export interface NextBestAction {
  readonly lead_id: string;
  readonly owner_user_id: string | null;
  readonly action: NbaAction;
  readonly reason: string;            // human-readable, deterministic
  readonly run_at: string;            // ISO timestamp
  readonly sequence_id: string | null;
  readonly confidence: number;        // 0..1, derived from rules — not ML
}

/** Escalation taxonomy — fixed list. */
export const ESCALATION_KINDS = [
  "unknown_reply",
  "delivery_failed",
  "high_value_unbooked",
  "repeated_no_show",
  "ai_uncertainty",
  "consent_missing",
  "capacity_overload",
] as const;
export type EscalationKind = (typeof ESCALATION_KINDS)[number];

export const ESCALATION_SEVERITY = ["info", "warning", "critical"] as const;
export type EscalationSeverity = (typeof ESCALATION_SEVERITY)[number];

/**
 * Collision-prevention preflight.
 * MUST run server-side before any outbound action (message OR call).
 * Returns first failing reason, or null if cleared.
 */
export const COLLISION_CHECKS = [
  "feature_flag_enabled",
  "consent_present",
  "do_not_contact_clear",
  "outside_quiet_hours",
  "no_active_sequence_lock",
  "owner_matches_or_admin",
  "cooldown_passed",
  "capacity_safe",
] as const;
export type CollisionCheck = (typeof COLLISION_CHECKS)[number];

export interface CollisionResult {
  readonly cleared: boolean;
  readonly failed_check: CollisionCheck | null;
  readonly detail: string | null;
}

/** Cockpit dashboard sections — fixed order, no additions without canon update. */
export const COCKPIT_SECTIONS = [
  "status",        // KPIs + funnel snapshot
  "attention",     // escalations queue
  "automation",    // active flags + sequence counts
  "next_action",   // NBA queue (operator-confirmable)
] as const;
export type CockpitSection = (typeof COCKPIT_SECTIONS)[number];

/** Per-funnel guardrails admin enforces on L6 overrides. */
export const ADMIN_GUARDRAILS = {
  min_message_delay_minutes: 15,
  max_messages_per_lead_per_24h: 4,
  ai_setter_max_calls_per_lead: 3,
  forced_quiet_hours_local: { start: "21:00", end: "08:00" },
  emergency_shutdown_admin_only: true,
} as const;

export const ALLOWED_ACCESS_LEVELS = {
  read_own_funnel: 6,   // L6 Senior Closer
  read_all_funnels: 99, // admin only (gate via has_role)
  toggle_flags: 6,      // L6 within guardrails
  emergency_shutdown: 99,
} as const;

export function isFeatureFlag(s: string): s is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(s);
}
