/**
 * ═══════════════════════════════════════════════════════════════════════
 * BOOKING PRIORITY ENGINE — Phase 3 Extension
 * Layer 51 — Canonical Decision Engine Integration
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Computes booking priority from canonical lead state.
 * Does NOT create new scoring logic — delegates entirely to
 * computeCanonicalDecision().
 *
 * Priority tiers affect:
 *   HIGH   → best slots, fastest assignment, senior closer eligible
 *   MEDIUM → normal flow
 *   LOW    → restricted slots, no fastlane, lower assignment priority
 *
 * Block: Conversion (primary) · Intelligence
 * ═══════════════════════════════════════════════════════════════════════
 */

import {
  computeCanonicalDecision,
  type LeadPriority,
  type CanonicalDecision,
} from './canonical-decision-engine';

// ─── BOOKING PRIORITY RULES ────────────────────────────────────────

export interface BookingPriorityResult {
  priority: LeadPriority;
  decision: CanonicalDecision;
  rules: BookingRules;
}

export interface BookingRules {
  /** Can see premium/early slots */
  bestSlots: boolean;
  /** Gets faster assignment to closers */
  fastAssignment: boolean;
  /** Eligible for senior closer (L5+) */
  seniorCloserEligible: boolean;
  /** Can use fastlane/priority booking */
  fastlaneAllowed: boolean;
  /** Max visible slots (null = no restriction) */
  maxVisibleSlots: number | null;
}

const RULES_BY_PRIORITY: Record<LeadPriority, BookingRules> = {
  HIGH: {
    bestSlots: true,
    fastAssignment: true,
    seniorCloserEligible: true,
    fastlaneAllowed: true,
    maxVisibleSlots: null,
  },
  MEDIUM: {
    bestSlots: false,
    fastAssignment: false,
    seniorCloserEligible: false,
    fastlaneAllowed: true,
    maxVisibleSlots: null,
  },
  LOW: {
    bestSlots: false,
    fastAssignment: false,
    seniorCloserEligible: false,
    fastlaneAllowed: false,
    maxVisibleSlots: 5,
  },
};

/**
 * Compute booking priority for a lead using the Canonical Decision Engine.
 * This is the ONLY function that determines how a lead is treated in booking.
 */
export function computeBookingPriority(lead: Record<string, any>): BookingPriorityResult {
  const decision = computeCanonicalDecision(lead);
  const priority = decision.priority;
  const rules = RULES_BY_PRIORITY[priority];

  return { priority, decision, rules };
}

/**
 * Compute priority for server-side use (edge functions).
 * Mirrors the canonical priority logic without importing the full engine
 * (which runs in Deno). Returns only the priority string.
 */
export function computeBookingPriorityServer(lead: Record<string, any>): LeadPriority {
  // Replicate the canonical priority derivation for server context
  const phoneValid = lead.phone_valid === true;
  const waConfirmed = lead.whatsapp_confirmed === true || lead.whatsapp_opt_in === true;
  const waUnresponsive = lead.whatsapp_unresponsive === true;
  const noShows = Number(lead.total_no_shows ?? 0);
  const attended = Number(lead.total_calls_attended ?? 0);

  // Derive quality from raw fields (same as canonical engine)
  const qs = Number(lead.quiz_score ?? lead.qualification_score ?? 0);
  const lq = String(lead.lead_quality ?? '').toUpperCase();
  const quality = lq === 'A' || qs >= 12 ? 'high' : lq === 'B' || qs >= 7 ? 'mid' : 'low';

  // Derive attendance risk
  let risk: 'low' | 'mid' | 'high' = 'low';
  if (waUnresponsive && !waConfirmed) risk = 'high';
  else if (noShows >= 2) risk = 'high';
  else if (noShows === 1 && attended === 0) risk = waConfirmed ? 'mid' : 'high';
  else if (noShows === 1 && attended >= 1) risk = waConfirmed ? 'low' : 'mid';

  // Priority matrix (same as canonical engine)
  if (risk === 'high' && !waConfirmed) return 'LOW';
  if (phoneValid && quality !== 'low' && risk !== 'high' && waConfirmed) return 'HIGH';
  if (qs >= 7 || (phoneValid && quality !== 'low')) return 'MEDIUM';
  return 'LOW';
}

/**
 * Get booking rules for a given priority tier.
 */
export function getBookingRules(priority: LeadPriority): BookingRules {
  return RULES_BY_PRIORITY[priority];
}

// ─── DASHBOARD KPI HELPERS ─────────────────────────────────────────

export interface BookingPriorityKpis {
  total: number;
  high: number;
  medium: number;
  low: number;
  highShowRate: number;
  mediumShowRate: number;
  lowShowRate: number;
  highCloseRate: number;
  mediumCloseRate: number;
  lowCloseRate: number;
}

const SHOW_STATES = new Set(['showed', 'closed_won', 'closed_lost']);
const CLOSE_STATES = new Set(['closed_won']);

/**
 * Compute booking/show/close KPIs split by priority tier.
 */
export function computeBookingPriorityKpis(
  appointments: Array<{
    booking_priority?: string;
    appointment_status?: string;
    lead?: { conversion_state?: string } | null;
  }>,
): BookingPriorityKpis {
  let high = 0, medium = 0, low = 0;
  let highShows = 0, medShows = 0, lowShows = 0;
  let highCloses = 0, medCloses = 0, lowCloses = 0;

  for (const apt of appointments) {
    const p = apt.booking_priority ?? 'MEDIUM';
    const state = apt.appointment_status ?? '';
    const leadState = apt.lead?.conversion_state ?? '';
    const showed = SHOW_STATES.has(leadState) || state === 'completed' || state === 'showed';
    const closed = CLOSE_STATES.has(leadState);

    if (p === 'HIGH') { high++; if (showed) highShows++; if (closed) highCloses++; }
    else if (p === 'LOW') { low++; if (showed) lowShows++; if (closed) lowCloses++; }
    else { medium++; if (showed) medShows++; if (closed) medCloses++; }
  }

  return {
    total: high + medium + low,
    high, medium, low,
    highShowRate: high > 0 ? highShows / high : 0,
    mediumShowRate: medium > 0 ? medShows / medium : 0,
    lowShowRate: low > 0 ? lowShows / low : 0,
    highCloseRate: high > 0 ? highCloses / high : 0,
    mediumCloseRate: medium > 0 ? medCloses / medium : 0,
    lowCloseRate: low > 0 ? lowCloses / low : 0,
  };
}

// ─── AUDIT QUERY HELPERS ───────────────────────────────────────────

/** Event types emitted by the booking priority system. */
export const BOOKING_PRIORITY_EVENT_TYPES = [
  'BOOKING_PRIORITY_ASSIGNED',
  'BOOKING_PRIORITY_RECOMPUTED',
] as const;

/**
 * Build a Supabase query filter for booking priority audit events.
 * Usage: supabase.from('event_logs').select('*').in('event_type', getBookingPriorityEventTypes())
 */
export function getBookingPriorityEventTypes(): string[] {
  return [...BOOKING_PRIORITY_EVENT_TYPES];
}
