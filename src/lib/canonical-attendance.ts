/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYER 27 — Canonical Attendance OS (Smart Attendance System™)
 *
 * Block: Conversion (primary) · Foundation · Governance
 * Status: active
 * Source of truth for: appointment lifecycle states, reminder triggers,
 * recovery sequences, voice-confirmation rules, risk scoring inputs.
 *
 * INVARIANTS (must hold forever):
 *  1. Supabase is SoT. Twilio is the channel. GHL stays untouched.
 *  2. Strictly additive — if attendance_settings.enabled = false everywhere,
 *     the platform behaves exactly as before.
 *  3. Per-operator opt-in. No live send unless BOTH global flag AND
 *     operator flag are true AND consent is valid AND inside allowed hours.
 *  4. Every status transition produces an attendance_events row.
 *     No silent failures.
 *  5. Reminder triggers are a closed set (TRIGGERS below). Adding a new one
 *     requires a canon revision — never invent ad-hoc triggers in features.
 *  6. Recovery sequence has a hard cap (max_attempts) per stage.
 *  7. Test mode (test_mode = true) NEVER hits Twilio; it logs simulated sends.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const ATTENDANCE_CANON_VERSION = '1.0.0';

/** Closed set of appointment-attendance statuses (state machine). */
export const ATTENDANCE_STATUSES = [
  'booked',
  'confirmation_pending',
  'confirmed',
  'at_risk',
  'reschedule_requested',
  'rescheduled',
  'no_show',
  'recovered',
  'showed',
  'closed_won',
  'closed_lost',
] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

/** Allowed status transitions. Any other transition must be rejected. */
export const ATTENDANCE_TRANSITIONS: Readonly<Record<AttendanceStatus, AttendanceStatus[]>> = Object.freeze({
  booked:               ['confirmation_pending', 'confirmed', 'at_risk', 'reschedule_requested', 'no_show', 'showed'],
  confirmation_pending: ['confirmed', 'at_risk', 'reschedule_requested', 'no_show', 'showed'],
  confirmed:            ['at_risk', 'reschedule_requested', 'no_show', 'showed'],
  at_risk:              ['confirmed', 'reschedule_requested', 'no_show', 'showed', 'recovered'],
  reschedule_requested: ['rescheduled', 'no_show'],
  rescheduled:          ['booked', 'confirmation_pending'],
  no_show:              ['recovered', 'reschedule_requested'],
  recovered:            ['rescheduled', 'showed'],
  showed:               ['closed_won', 'closed_lost'],
  closed_won:           [],
  closed_lost:          [],
});

/** Closed set of reminder/recovery triggers. */
export const TRIGGERS = [
  'on_booking',
  't_minus_24h',
  't_minus_3h',
  't_minus_30m',
  't_plus_5m_no_show',
  't_plus_15m_no_show',
  't_plus_24h_recovery',
  't_plus_72h_recovery',
] as const;
export type AttendanceTrigger = typeof TRIGGERS[number];

/** Channels (cascade-ready). Voice is optional + provider-pending. */
export const CHANNELS = ['whatsapp', 'sms', 'voice', 'email'] as const;
export type AttendanceChannel = typeof CHANNELS[number];

export const DEFAULT_CHANNEL_CASCADE: readonly AttendanceChannel[] = Object.freeze(['whatsapp', 'sms']);

/** Risk-score inputs (deterministic; weights live in DB settings). */
export const RISK_SIGNALS = [
  'no_response_to_confirm',
  'time_proximity',
  'previous_no_show',
  'delivery_failure',
  'lead_quality_low',
] as const;
export type RiskSignal = typeof RISK_SIGNALS[number];

/** Allowed call/send window (server-enforced). */
export const ALLOWED_HOURS = Object.freeze({ start: 9, end: 19, tz: 'Europe/Berlin' });

export interface AttendanceSettingsShape {
  smart_attendance_enabled: boolean;
  test_mode: boolean;
  default_cascade: AttendanceChannel[];
  allowed_hours_start: number;
  allowed_hours_end: number;
  allowed_hours_tz: string;
  voice_confirmation_enabled: boolean;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettingsShape = Object.freeze({
  smart_attendance_enabled: false,
  test_mode: true,
  default_cascade: [...DEFAULT_CHANNEL_CASCADE],
  allowed_hours_start: ALLOWED_HOURS.start,
  allowed_hours_end: ALLOWED_HOURS.end,
  allowed_hours_tz: ALLOWED_HOURS.tz,
  voice_confirmation_enabled: false,
});

/** Helper — guard for status transitions (used by trigger + edge functions). */
export function canTransition(from: AttendanceStatus, to: AttendanceStatus): boolean {
  return ATTENDANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Helper — guard against invented triggers in features. */
export function assertAttendanceTrigger(t: string): asserts t is AttendanceTrigger {
  if (!(TRIGGERS as readonly string[]).includes(t)) {
    throw new Error(`[Layer 27] "${t}" is not a canonical attendance trigger.`);
  }
}
