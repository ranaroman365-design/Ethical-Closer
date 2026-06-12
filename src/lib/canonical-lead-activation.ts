/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYER 29 — Canonical Lead Activation OS (Pre-Booking Touchpoint System)
 *
 * Block: Acquisition (primary) · Conversion · Foundation
 * Status: active · Phase 1 (silent foundation)
 *
 * Purpose: Drives every L0 lead from `lead_created` to `booked` through a
 * deterministic, opt-in cadence of touchpoints — INDEPENDENT of:
 *  - Layer 27 (Smart Attendance — post-booking only)
 *  - Layer 28 (AI Setter Voice — call layer)
 *  - GHL automation (legacy channel)
 *
 * INVARIANTS:
 *  1. Supabase is SoT. GHL stays untouched until per-funnel cutover.
 *  2. Strictly additive — if `lead_activation_settings.enabled = false`
 *     globally OR for the funnel, ZERO outbound fires from this layer.
 *  3. Touchpoints are a CLOSED set (TOUCHPOINTS below). Adding one =
 *     canon revision; never invent ad-hoc touchpoints in features.
 *  4. Each touchpoint produces exactly one `lead_activation_jobs` row
 *     scheduled at `lead.created_at + offset_minutes`.
 *  5. Phase ends at first `booked` event for the lead — remaining jobs
 *     are auto-cancelled by the processor (no double-send w/ Layer 27).
 *  6. Test mode (`test_mode = true`) NEVER hits Twilio/Email — logs only.
 *  7. Operator overrides (L6) replace global defaults per (funnel × tp).
 *
 * STOPS WHEN: lead enters BOOKED, becomes do_not_contact, or unsubscribes.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const LEAD_ACTIVATION_CANON_VERSION = '1.0.0';

/** Lifecycle phases this layer owns (Phase 4+ owned by Layer 27). */
export const ACTIVATION_PHASES = [
  'entry',         // TP1
  'activation',    // TP2 + TP3 + TP4 + TP5
  'pre_booking',   // TP6 + TP7
  'reactivation',  // TP8 + TP9 + (long tail)
] as const;
export type ActivationPhase = typeof ACTIVATION_PHASES[number];

/** Closed set of touchpoint codes. */
export const TOUCHPOINTS = [
  'TP1_LEAD_CREATED',          // immediate magic-link mail
  'TP2_IMMEDIATE_WHATSAPP',    // immediate (after channel resolve)
  'TP3_PLUS_15M',
  'TP4_PLUS_2H',
  'TP5_PLUS_24H',
  'TP6_DAY_2',
  'TP7_DAY_3_FINAL',
  'TP8_DAY_7_REACTIVATION',
  'TP9_DAY_14_REACTIVATION',
] as const;
export type Touchpoint = typeof TOUCHPOINTS[number];

/** Channels supported for activation messages. */
export const ACTIVATION_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
export type ActivationChannel = typeof ACTIVATION_CHANNELS[number];

/** Default cadence definition (offsets in minutes from lead.created_at). */
export interface TouchpointDefault {
  code: Touchpoint;
  phase: ActivationPhase;
  offset_minutes: number;
  channel: ActivationChannel;
  purpose: string;
}

export const TOUCHPOINT_DEFAULTS: readonly TouchpointDefault[] = Object.freeze([
  { code: 'TP1_LEAD_CREATED',       phase: 'entry',        offset_minutes: 0,        channel: 'email',    purpose: 'magic_link_orientation' },
  { code: 'TP2_IMMEDIATE_WHATSAPP', phase: 'activation',   offset_minutes: 2,        channel: 'whatsapp', purpose: 'first_cta' },
  { code: 'TP3_PLUS_15M',           phase: 'activation',   offset_minutes: 15,       channel: 'whatsapp', purpose: 'momentum_nudge' },
  { code: 'TP4_PLUS_2H',            phase: 'activation',   offset_minutes: 120,      channel: 'sms',      purpose: 'reactivation_short' },
  { code: 'TP5_PLUS_24H',           phase: 'activation',   offset_minutes: 1440,     channel: 'whatsapp', purpose: 'last_chance_today' },
  { code: 'TP6_DAY_2',              phase: 'pre_booking',  offset_minutes: 2880,     channel: 'whatsapp', purpose: 'decision_force' },
  { code: 'TP7_DAY_3_FINAL',        phase: 'pre_booking',  offset_minutes: 4320,     channel: 'whatsapp', purpose: 'final_push' },
  { code: 'TP8_DAY_7_REACTIVATION', phase: 'reactivation', offset_minutes: 10080,    channel: 'email',    purpose: 'reopen' },
  { code: 'TP9_DAY_14_REACTIVATION',phase: 'reactivation', offset_minutes: 20160,    channel: 'email',    purpose: 'final_reopen' },
]);

/** Canonical stop events — processor cancels remaining jobs on these. */
export const STOP_EVENTS = ['booked', 'do_not_contact', 'unsubscribed'] as const;
export type StopEvent = typeof STOP_EVENTS[number];

/** Allowed send window (server-enforced; identical to Layer 27 for consistency). */
export const ACTIVATION_ALLOWED_HOURS = Object.freeze({ start: 8, end: 21, tz: 'Europe/Berlin' });

export interface LeadActivationSettingsShape {
  lead_activation_enabled: boolean;
  test_mode: boolean;
  allowed_hours_start: number;
  allowed_hours_end: number;
  allowed_hours_tz: string;
  default_channel_per_phase: Record<ActivationPhase, ActivationChannel>;
}

export const DEFAULT_LEAD_ACTIVATION_SETTINGS: LeadActivationSettingsShape = {
  lead_activation_enabled: false, // SILENT until per-funnel opt-in
  test_mode: true,
  allowed_hours_start: ACTIVATION_ALLOWED_HOURS.start,
  allowed_hours_end: ACTIVATION_ALLOWED_HOURS.end,
  allowed_hours_tz: ACTIVATION_ALLOWED_HOURS.tz,
  default_channel_per_phase: {
    entry: 'email' as const,
    activation: 'whatsapp' as const,
    pre_booking: 'whatsapp' as const,
    reactivation: 'email' as const,
  },
};

/** Guard against invented touchpoints in features. */
export function assertTouchpoint(tp: string): asserts tp is Touchpoint {
  if (!(TOUCHPOINTS as readonly string[]).includes(tp)) {
    throw new Error(`[Layer 29] "${tp}" is not a canonical touchpoint.`);
  }
}

/** Lookup helper used by scheduler + UI. */
export function getTouchpointDefault(code: Touchpoint): TouchpointDefault {
  const t = TOUCHPOINT_DEFAULTS.find((d) => d.code === code);
  if (!t) throw new Error(`[Layer 29] no default for "${code}"`);
  return t;
}

/** True if the touchpoint should be cancelled because the lead booked. */
export function shouldCancelOnBook(code: Touchpoint): boolean {
  // Reactivation tier remains useful only if we want win-back; for now hard-stop on booked.
  return true;
}
