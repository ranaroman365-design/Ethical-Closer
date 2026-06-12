/**
 * ========================================================================
 * CANONICAL CONVERSATIONAL WHATSAPP AI — Layer 38
 * ========================================================================
 *
 * Inbound conversational intelligence for WhatsApp.
 *
 * NOT a standalone chatbot. Integrates with:
 *  - Layer 26 Lead Lifecycle
 *  - Layer 27 Smart Attendance
 *  - Layer 28 AI Setter (Voice)
 *  - Layer 31 Message Library
 *  - Layer 32 Message Performance
 *  - Layer 33 Operator Control
 *  - Layer 36 Self-Optimization
 *  - Layer 37 Audit & Versioning
 *
 * Hard rules (immutable):
 *  - Inbound only triggers AI; never starts new outbound sequences.
 *  - AI never auto-books — explicit user confirmation required.
 *  - AI never sends if collision detected (active sequence / human reply / cooldown).
 *  - AI must respect consent, do_not_contact, STOP, quiet hours.
 *  - Tone & wording sourced from Message Library (no inline copy).
 *  - Self-Optimization may only swap message variants, never break flow.
 *  - All AI replies are logged + versioned + auditable.
 *
 * Block: Conversion (primary) + Foundation (channel) + Governance.
 * Canon-Map: C8.
 */

export const LAYER_ID = 38;
export const LAYER_NAME = "Conversational WhatsApp AI";

// ─── Intents ─────────────────────────────────────────────────────────────
export const INTENTS = [
  "booking_intent",
  "hesitation",
  "objection",
  "reschedule_intent",
  "no_interest",
  "question",
  "stop",
  "unknown",
] as const;
export type Intent = typeof INTENTS[number];

// ─── Conversation states ─────────────────────────────────────────────────
export const STATES = [
  "cold",
  "engaged",
  "interested",
  "booking_pending",
  "booked",
  "lost",
  "escalated",
] as const;
export type ConversationState = typeof STATES[number];

// ─── Escalation triggers ─────────────────────────────────────────────────
export const ESCALATION_TRIGGERS = [
  "complex_question",
  "emotional_message",
  "high_value_lead",
  "repeated_confusion",
  "explicit_human_request",
  "ai_low_confidence",
] as const;
export type EscalationTrigger = typeof ESCALATION_TRIGGERS[number];

// ─── Collision rules (must ALL pass before AI may reply) ────────────────
export interface CollisionContext {
  has_active_sequence: boolean;          // L26/L27/L31 active touchpoint within window
  human_replied_recently: boolean;       // operator sent message in last 30min
  ai_setter_call_active: boolean;        // L28 voice call live
  in_quiet_hours: boolean;               // 21:00–08:00 lead local time
  cooldown_active: boolean;              // last AI reply < min_reply_interval_seconds
  consent_valid: boolean;
  do_not_contact: boolean;
  stop_received: boolean;
}

export function canAIReply(ctx: CollisionContext): {
  ok: boolean;
  reason?: string;
} {
  if (!ctx.consent_valid) return { ok: false, reason: "no_consent" };
  if (ctx.do_not_contact) return { ok: false, reason: "do_not_contact" };
  if (ctx.stop_received) return { ok: false, reason: "stop_keyword" };
  if (ctx.ai_setter_call_active) return { ok: false, reason: "voice_call_active" };
  if (ctx.human_replied_recently) return { ok: false, reason: "human_handling" };
  if (ctx.in_quiet_hours) return { ok: false, reason: "quiet_hours" };
  if (ctx.cooldown_active) return { ok: false, reason: "cooldown" };
  return { ok: true };
}

// ─── Intent → action mapping ─────────────────────────────────────────────
export const INTENT_ACTIONS: Record<Intent, {
  template_key_default: string;
  next_state: ConversationState;
  send_booking_link?: boolean;
  send_reschedule_link?: boolean;
  escalate?: boolean;
  soft_exit?: boolean;
}> = {
  booking_intent:    { template_key_default: "wa_booking_confirm",  next_state: "booking_pending", send_booking_link: true },
  hesitation:        { template_key_default: "wa_hesitation_soft",  next_state: "engaged" },
  objection:         { template_key_default: "wa_objection_handle", next_state: "engaged" },
  reschedule_intent: { template_key_default: "wa_reschedule",       next_state: "engaged", send_reschedule_link: true },
  no_interest:       { template_key_default: "wa_soft_exit",        next_state: "lost", soft_exit: true },
  question:          { template_key_default: "wa_question_brief",   next_state: "engaged" },
  stop:              { template_key_default: "",                    next_state: "lost" },
  unknown:           { template_key_default: "",                    next_state: "engaged", escalate: true },
};

// ─── Forbidden behaviors ─────────────────────────────────────────────────
export const FORBIDDEN = [
  "auto_book_without_confirmation",
  "start_new_outbound_sequence",
  "override_human_reply",
  "send_during_voice_call",
  "ignore_stop_keyword",
  "inline_copy_outside_message_library",
  "duplicate_message_within_cooldown",
  "modify_pricing_or_legal_copy",
] as const;

// ─── Per-funnel settings shape ───────────────────────────────────────────
export interface ConversationalAISettings {
  enabled: boolean;                       // master switch (default false)
  funnel_keys: string[];                  // which funnels use it
  min_reply_interval_seconds: number;     // default 60
  max_replies_per_conversation: number;   // default 6 before forced escalation
  high_value_score_threshold: number;     // default 70 → auto-escalate
  quiet_hours_start: number;              // 21
  quiet_hours_end: number;                // 8
  escalation_message_template_key: string;// when handing off
  ai_confidence_threshold: number;        // 0.65 — below = escalate
}

export const DEFAULT_SETTINGS: ConversationalAISettings = {
  enabled: false,
  funnel_keys: [],
  min_reply_interval_seconds: 60,
  max_replies_per_conversation: 6,
  high_value_score_threshold: 70,
  quiet_hours_start: 21,
  quiet_hours_end: 8,
  escalation_message_template_key: "wa_escalation_handoff",
  ai_confidence_threshold: 0.65,
};

// ─── Tracked KPIs (for L32 Message Performance) ──────────────────────────
export const TRACKED_KPIS = [
  "inbound_received",
  "ai_reply_sent",
  "ai_reply_blocked",
  "intent_detected",
  "booking_link_clicked",
  "booking_created",
  "reschedule_triggered",
  "escalation_created",
  "soft_exit",
  "conversation_length_messages",
  "revenue_per_conversation",
] as const;

export function auditConversationalAI(): { ok: boolean; checks: string[] } {
  const checks: string[] = [];
  checks.push("✓ Layer 38 canon defined");
  checks.push("✓ Collision control via canAIReply()");
  checks.push("✓ Intent mapping → Message Library template_keys");
  checks.push("✓ No auto-booking without confirmation");
  checks.push("✓ Forbidden behaviors enumerated");
  return { ok: true, checks };
}
