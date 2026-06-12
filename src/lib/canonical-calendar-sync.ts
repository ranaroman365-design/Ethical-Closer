/**
 * Layer 27b — Calendar Sync Engine
 *
 * Constitutional position:
 *   Block:        Conversion (primary) + Foundation + Governance
 *   Governing:    Canon Constitution v1, composes L27 (Smart Attendance)
 *   Source:       reschedule_appointment(_old_id, _new_starts_at, _new_ends_at, _reason)
 *                 RPC + appointment_reschedules audit table.
 *
 * Purpose:
 *   Single chokepoint for moving an appointment in time. Guarantees that
 *   ALL participants (lead, setter, closer) see the same truth and that
 *   the old slot is freed atomically.
 *
 * Hard rules:
 *   1. ONE RPC. No direct UPDATE of appointments.starts_at allowed for
 *      reschedules — UI MUST call reschedule_appointment().
 *   2. Old appointment status → 'rescheduled' (never deleted; audit-friendly).
 *   3. New appointment status → 'booked' with booking_source='reschedule'.
 *   4. Same lead, setter, closer carried over by default.
 *   5. Single audit row in appointment_reschedules links old → new.
 *   6. Emits canonical event 'appointment_rescheduled' via outbound_events
 *      so attendance reminders + AI setter cascades re-arm against new time.
 *   7. Permission: setter, admin, or assigned funnel operator. Lead self-reschedule
 *      goes through a separate consented flow (not this canon).
 *   8. Future-time only. New end > new start. Status not in terminal set.
 */

export const CALENDAR_SYNC_LAYER_ID = "27b" as const;

export interface RescheduleResult {
  readonly old_appointment_id: string;
  readonly new_appointment_id: string;
  readonly lead_id: string;
  readonly setter_id: string | null;
  readonly starts_at: string; // ISO
}

/** Statuses where reschedule is rejected. */
export const RESCHEDULE_FORBIDDEN_STATUSES = [
  "rescheduled",
  "cancelled",
  "completed",
  "closed_won",
  "closed_lost",
] as const;

/** Parties notified by the canonical 'appointment_rescheduled' event. */
export const RESCHEDULE_NOTIFY = ["lead", "setter", "closer"] as const;
