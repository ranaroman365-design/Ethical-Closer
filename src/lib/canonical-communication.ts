/**
 * ═══════════════════════════════════════════════════════════════════════
 *  CANONICAL COMMUNICATION CANON — Layer 45 (FINAL & NON-NEGOTIABLE)
 *  Canon-Map: F8 (Foundation, Meta-Canon over C1/C8/C11/G6)
 *
 *  Single source of truth for the entire ETC communication architecture.
 *  All future communication features MUST conform. No exceptions.
 *
 *  Composition (does NOT replace, but governs):
 *    - C1   Communication Delivery Canon
 *    - C4   Attendance OS (Layer 27)
 *    - C5   AI Setter Voice (Layer 28)
 *    - C6   Lead Activation Touchpoints (Layer 29)
 *    - C7   Level-Based Messaging (Layer 30)
 *    - C8   Conversational WhatsApp AI (Layer 38)
 *    - C11  Push Notification Channel (Layer 44)
 *    - F7   Unified Message Library (Layer 31)
 *    - G6   Email Documentation Layer (Layer 43)
 *
 *  Final principle:
 *    "We do not send messages. We orchestrate communication
 *     across channels based on state, intent, and system logic."
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────
// 1. SYSTEM ROLE MAP — every layer has exactly one job.
// ─────────────────────────────────────────────────────────────────────
export const SYSTEM_ROLES = Object.freeze({
  brain:     { component: 'Supabase',       role: 'logic, state, decisions' },
  planning:  { component: 'Queues',         role: 'execution planning' },
  processor: { component: 'Edge Functions', role: 'rules, render, dispatch' },
  external:  { component: 'Twilio',         role: 'WhatsApp / SMS / Voice send' },
  reengage:  { component: 'Push Service',   role: 'in-app / web_push reminders' },
  document:  { component: 'Email Service',  role: 'documentation & confirmations' },
  control:   { component: 'Dashboard',      role: 'visibility & manual ops (NEVER sends)' },
} as const);

// ─────────────────────────────────────────────────────────────────────
// 2. CANONICAL FLOW (closed loop) — order is fixed.
// ─────────────────────────────────────────────────────────────────────
export const CANONICAL_FLOW = Object.freeze([
  'event_happens',
  'state_updated',
  'job_enqueued',
  'edge_function_processes',
  'channel_selected',
  'template_rendered',
  'guardrails_checked',
  'message_sent',
  'delivery_logged',
  'response_processed',
  'state_updated_again',
] as const);

// ─────────────────────────────────────────────────────────────────────
// 3. QUEUE REGISTRY — the only legal outbound paths.
// ─────────────────────────────────────────────────────────────────────
export const COMMUNICATION_QUEUES = Object.freeze({
  communication_queue: { processor: 'process-communication-jobs', channels: ['whatsapp', 'sms'] as const },
  attendance_queue:    { processor: 'process-attendance-jobs',    channels: ['whatsapp', 'sms', 'email'] as const },
  ai_setter_queue:     { processor: 'process-ai-setter-jobs',     channels: ['voice'] as const },
  push_queue:          { processor: 'process-push-jobs',          channels: ['in_app', 'web_push'] as const },
  email_queue:         { processor: 'process-email-jobs',         channels: ['email'] as const },
} as const);

export type QueueName = keyof typeof COMMUNICATION_QUEUES;

export interface CommJob {
  lead_id: string;
  funnel_id: string;
  operator_id: string | null;
  channel: 'whatsapp' | 'sms' | 'voice' | 'in_app' | 'web_push' | 'email';
  trigger: string;        // canonical event name
  template_id: string;    // message_library key
  scheduled_at: string;   // ISO
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  retry_count: number;
}

// ─────────────────────────────────────────────────────────────────────
// 4. CHANNEL ROLES — strict separation, no overlap.
// ─────────────────────────────────────────────────────────────────────
export type ChannelRole = 'conversion' | 'reengagement' | 'documentation';

export const CHANNEL_ROLE_MAP = Object.freeze({
  whatsapp: 'conversion',
  sms:      'conversion',
  voice:    'conversion',
  in_app:   'reengagement',
  web_push: 'reengagement',
  email:    'documentation',
} as const) satisfies Record<string, ChannelRole>;

/** Forbidden combinations — used by audit gate. */
export const FORBIDDEN_CHANNEL_USES = Object.freeze([
  { channel: 'email', purpose: 'sales_pressure',    reason: 'Email = documentation only.' },
  { channel: 'email', purpose: 'discount_offer',    reason: 'Email = documentation only.' },
  { channel: 'email', purpose: 'reactivation_push', reason: 'Use WhatsApp/SMS for active conversion.' },
  { channel: 'web_push', purpose: 'sales_pitch',    reason: 'Push = bring user back, not sell.' },
  { channel: 'whatsapp', purpose: 'legal_notice',   reason: 'Use email for documentation.' },
]);

// ─────────────────────────────────────────────────────────────────────
// 5. EDGE FUNCTION REGISTRY — canonical processors only.
// ─────────────────────────────────────────────────────────────────────
export const PROCESSING_FUNCTIONS = Object.freeze([
  'process-communication-jobs',
  'process-attendance-jobs',
  'process-ai-setter-jobs',
  'process-push-jobs',
  'process-email-jobs',
  'handle-twilio-webhook',
  'handle-push-events',
  'handle-email-events',
] as const);

// ─────────────────────────────────────────────────────────────────────
// 6. COLLISION-PREVENTION CHECKLIST — must pass ALL before send.
// ─────────────────────────────────────────────────────────────────────
export const PRE_SEND_CHECKS = Object.freeze([
  'active_sequence_lock',
  'last_message_cooldown',
  'channel_cooldown',
  'consent_granted',
  'do_not_contact_flag',
  'quiet_hours_window',
  'operator_scope_match',
  'lead_ownership_match',
] as const);

export interface PreSendDecision {
  allowed: boolean;
  failed_check?: typeof PRE_SEND_CHECKS[number];
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────
// 7. HARD RULES — deterministic invariants. Violations = canon breach.
// ─────────────────────────────────────────────────────────────────────
export const HARD_RULES = Object.freeze([
  'No direct sending outside queues.',
  'Dashboard NEVER sends messages directly.',
  'Each channel has exactly one role (conversion / reengagement / documentation).',
  'No duplicate purpose across channels.',
  'Every send must be logged with channel, timestamp, template, status, response, linked event.',
  'Every state change must be reversible via versioning.',
  'STOP / DNC always wins; sets do_not_contact=true.',
  'Email is never used for selling, discounts, or pressure.',
  'Push is never used to sell — only to bring the user back.',
  'WhatsApp/SMS/Voice never carry legal/documentation purpose.',
] as const);

// ─────────────────────────────────────────────────────────────────────
// 8. AUDIT GATE — call from CI / admin diagnostics.
// ─────────────────────────────────────────────────────────────────────
export interface CommCanonAuditResult {
  ok: boolean;
  violations: string[];
  summary: { queues: number; channels: number; processors: number };
}

export function auditCommunicationCanon(): CommCanonAuditResult {
  const violations: string[] = [];

  // Each queue must reference a known processor.
  for (const [q, def] of Object.entries(COMMUNICATION_QUEUES)) {
    if (!PROCESSING_FUNCTIONS.includes(def.processor as any)) {
      violations.push(`Queue ${q} references unknown processor ${def.processor}`);
    }
  }

  // Each declared channel must have a role.
  const declared = new Set<string>();
  for (const def of Object.values(COMMUNICATION_QUEUES)) {
    for (const ch of def.channels) declared.add(ch);
  }
  for (const ch of declared) {
    if (!(ch in CHANNEL_ROLE_MAP)) {
      violations.push(`Channel ${ch} has no canonical role.`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    summary: {
      queues: Object.keys(COMMUNICATION_QUEUES).length,
      channels: Object.keys(CHANNEL_ROLE_MAP).length,
      processors: PROCESSING_FUNCTIONS.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// 9. FINAL STATEMENT — quoted in admin UI as canon banner.
// ─────────────────────────────────────────────────────────────────────
export const CANON_FINAL_STATEMENT =
  'The ETC platform does not send messages. It orchestrates ' +
  'communication across channels based on state, intent and system ' +
  'logic. Each channel has a single, clearly defined role. This ' +
  'architecture is final and must not be violated.';
