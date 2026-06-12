/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL CALENDAR — Layer 54 (BINDING)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ONE scheduling truth. Supabase owns calendars. GHL mirrors only.
 *
 * Block: Conversion
 * Layer: Revenue Engine
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── CALENDAR SOURCE OF TRUTH ───────────────────────────────────────

export interface CalendarTruthSource {
  table: string;
  purpose: string;
  isCanonical: boolean;
  ownerField: string | null;
}

export const CALENDAR_TRUTH_SOURCES: CalendarTruthSource[] = [
  {
    table: 'appointments',
    purpose: 'Primary scheduling truth. Contains all booked, rescheduled, and completed appointments.',
    isCanonical: true,
    ownerField: 'current_owner_id',
  },
  {
    table: 'availability_slots',
    purpose: 'Available booking windows. Drives capacity and slot selection.',
    isCanonical: true,
    ownerField: null, // System-level, not per-user
  },
  {
    table: 'calendar_events',
    purpose: 'Audit trail for all calendar mutations (reassignment, reschedule, cancel).',
    isCanonical: true,
    ownerField: 'new_owner_id',
  },
  {
    table: 'calendar_blockers',
    purpose: 'Time blocks preventing bookings (vacation, training, etc).',
    isCanonical: true,
    ownerField: null,
  },
  {
    table: 'setter_calendar_blocks',
    purpose: 'Setter-specific availability blocks.',
    isCanonical: true,
    ownerField: null,
  },
];

// ─── GHL CALENDAR RULES ────────────────────────────────────────────

export const GHL_CALENDAR_RULES = {
  allowed: [
    'Mirror appointments for notification purposes',
    'Send calendar invites via GHL email',
    'Sync appointment status for CRM visibility',
    'Trigger GHL workflow notifications',
  ],
  forbidden: [
    'Own appointment truth — Supabase is sole source',
    'Assign or reassign ownership — must go through Supabase',
    'Mutate scheduling state — all changes via canonical API',
    'Create appointments that bypass Supabase',
    'Override appointment status or outcome',
  ],
} as const;

// ─── SCHEDULING INTEGRITY RULES ────────────────────────────────────

export interface SchedulingRule {
  id: string;
  description: string;
  enforcement: string;
  table: string;
}

export const SCHEDULING_RULES: SchedulingRule[] = [
  {
    id: 'no_double_booking',
    description: 'A closer cannot have two overlapping appointments',
    enforcement: 'DB constraint + application check in create-appointment',
    table: 'appointments',
  },
  {
    id: 'reschedule_preserves_history',
    description: 'All reschedules create a link via rescheduled_from_id/rescheduled_to_id',
    enforcement: 'Application-level in create-appointment edge function',
    table: 'appointments',
  },
  {
    id: 'cancellation_logged',
    description: 'All cancellations must log to calendar_events with reason',
    enforcement: 'Application-level guard',
    table: 'calendar_events',
  },
  {
    id: 'reassignment_audited',
    description: 'All ownership changes logged to appointment_reassignment_log + calendar_events',
    enforcement: 'Application-level + appointment_reassignment_log table',
    table: 'appointment_reassignment_log',
  },
  {
    id: 'timezone_canonical',
    description: 'All times stored as UTC. Display timezone from booking_timezone/booking_utc_offset.',
    enforcement: 'DB columns booking_timezone + booking_utc_offset on appointments',
    table: 'appointments',
  },
  {
    id: 'availability_deterministic',
    description: 'Slot availability determined by availability_slots - calendar_blockers - existing appointments',
    enforcement: 'capacity-generate-slots edge function',
    table: 'availability_slots',
  },
];

// ─── CALENDAR EVENT TYPES ──────────────────────────────────────────

export const CALENDAR_EVENT_TYPES = [
  'booking_created',
  'booking_rescheduled',
  'booking_cancelled',
  'ownership_reassigned',
  'closer_assigned',
  'setter_reassigned',
  'operator_takeover',
  'no_show_detected',
  'attendance_confirmed',
  'call_started',
  'call_completed',
] as const;

export type CalendarEventType = typeof CALENDAR_EVENT_TYPES[number];

// ─── HARD RULES ─────────────────────────────────────────────────────

export const CALENDAR_HARD_RULES = [
  'Supabase appointments table is the SOLE scheduling truth',
  'GHL calendars mirror only — never own or mutate',
  'No appointment without starts_at and lead_id',
  'No reschedule without rescheduled_from_id linkage',
  'No cancellation without calendar_events audit entry',
  'No double-booking for the same closer in overlapping time windows',
  'All times UTC internally, display via booking_timezone',
  'Reassignment MUST update current_owner_id AND log to audit tables',
] as const;
