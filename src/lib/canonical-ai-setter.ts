/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYER 28 — Canonical AI Setter Voice Agent™
 *
 * Block: Conversion (primary) · Foundation · Governance
 * Status: active
 * Source of truth for: callable lead segments, call outcomes, follow-up
 * cascades, script block taxonomy, attempt caps, allowed call windows.
 *
 * INVARIANTS:
 *  1. Supabase is SoT. Twilio Voice is the execution layer.
 *  2. Strictly additive — if ai_setter_settings.ai_setter_enabled = false,
 *     the platform behaves exactly as before.
 *  3. NEVER call without consent. NEVER call do_not_contact leads.
 *     NEVER exceed max_attempts. NEVER call outside ALLOWED_HOURS.
 *  4. Every call attempt produces an ai_setter_call_logs row, success or fail.
 *  5. Test mode (test_mode = true) never dials — it logs a simulated outcome.
 *  6. Call outcomes are a closed set (CALL_OUTCOMES). Adding one = canon revision.
 *  7. Voice provider is intentionally unselected at v1.0. Edge function
 *     'ai-setter-place-call' MUST mark jobs as 'sent_stub' until decided.
 *
 * NOTE: Coexists with the existing ai_setter_sessions table (chat-based
 * pre-qualification simulator). This canon governs the VOICE agent layer
 * only — the two are independent.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const AI_SETTER_CANON_VERSION = '1.0.0';

/** Lead segments eligible for outbound voice. */
export const LEAD_SEGMENTS = [
  'unbooked_qualified',
  'booked_unconfirmed',
  'booked_at_risk',
  'no_show_recovery',
  'reschedule_requested',
] as const;
export type AiSetterSegment = typeof LEAD_SEGMENTS[number];

/** Closed set of call outcomes. */
export const CALL_OUTCOMES = [
  'booked',
  'booking_link_sent',
  'reschedule_link_sent',
  'not_interested',
  'call_back_later',
  'no_answer',
  'voicemail_left',
  'human_handoff',
  'failed',
] as const;
export type CallOutcome = typeof CALL_OUTCOMES[number];

/** Script block taxonomy — every script must use only these blocks. */
export const SCRIPT_BLOCKS = [
  'opener',
  'qualification',
  'value_bridge',
  'booking_push',
  'objections',
  'voicemail',
  'follow_up',
] as const;
export type ScriptBlock = typeof SCRIPT_BLOCKS[number];

/** Hard caps + allowed window. Server-enforced. */
export const AI_SETTER_LIMITS = Object.freeze({
  default_max_attempts: 3,
  call_window_start_hour: 9,
  call_window_end_hour: 19,
  call_window_tz: 'Europe/Berlin',
  min_minutes_between_attempts: 60,
});

export interface AiSetterSettingsShape {
  ai_setter_enabled: boolean;
  test_mode: boolean;
  max_attempts: number;
  call_window_start_hour: number;
  call_window_end_hour: number;
  call_window_tz: string;
  voice_provider: 'stub' | 'twilio_voice' | 'vapi' | 'retell' | 'elevenlabs_twilio';
}

export const DEFAULT_AI_SETTER_SETTINGS: AiSetterSettingsShape = Object.freeze({
  ai_setter_enabled: false,
  test_mode: true,
  max_attempts: AI_SETTER_LIMITS.default_max_attempts,
  call_window_start_hour: AI_SETTER_LIMITS.call_window_start_hour,
  call_window_end_hour: AI_SETTER_LIMITS.call_window_end_hour,
  call_window_tz: AI_SETTER_LIMITS.call_window_tz,
  voice_provider: 'stub',
});

export function assertCallOutcome(o: string): asserts o is CallOutcome {
  if (!(CALL_OUTCOMES as readonly string[]).includes(o)) {
    throw new Error(`[Layer 28] "${o}" is not a canonical call outcome.`);
  }
}

export function assertScriptBlock(b: string): asserts b is ScriptBlock {
  if (!(SCRIPT_BLOCKS as readonly string[]).includes(b)) {
    throw new Error(`[Layer 28] "${b}" is not a canonical script block.`);
  }
}
