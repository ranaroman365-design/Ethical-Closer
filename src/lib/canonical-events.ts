/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANONICAL EVENT REGISTRY (Hardwired)
 * Layer 14 — Event Name Lock
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for every event name written to:
 *   - public.outbound_events
 *   - public.community_events
 *   - public.audit_logs (action field)
 *   - any analytics / tracking pipeline
 *
 * WHY: outbound_events.event_name is currently free-text. This file is
 * the canonical wrapper. Use isCanonicalEventName() before any insert.
 * A future migration will convert event_name to a Postgres enum.
 *
 * HARD RULES:
 *   ❌ No undocumented event names
 *   ❌ No synonyms (one meaning per name)
 *   ❌ No free-text event names in new code
 *   ✅ Always import EVENTS.* and pass via assertCanonicalEventName()
 *
 * Memory: mem://architecture/canonical-events
 * ═══════════════════════════════════════════════════════════════════════
 */

import { CANONICAL_EVENTS } from './operational-canon';

// ─── EXTENDED CANONICAL EVENT SET ──────────────────────────────────────
// Superset of CANONICAL_EVENTS (operational-canon.ts) plus the additional
// outbound/community/automation events found in production code paths.
// Every value MUST also exist in the Postgres enum once migrated.
export const EVENTS = Object.freeze({
  // ─ Acquisition (mirror operational-canon)
  LEAD_CREATED:       CANONICAL_EVENTS.LEAD_CREATED,
  QUIZ_STARTED:       CANONICAL_EVENTS.QUIZ_STARTED,
  QUIZ_COMPLETED:     CANONICAL_EVENTS.QUIZ_COMPLETED,
  BOOKED:             CANONICAL_EVENTS.BOOKED,
  NO_SHOW:            CANONICAL_EVENTS.NO_SHOW,
  CALL_COMPLETED:     CANONICAL_EVENTS.CALL_COMPLETED,
  DEAL_WON:           CANONICAL_EVENTS.DEAL_WON,
  DEAL_LOST:          CANONICAL_EVENTS.DEAL_LOST,

  // ─ Lifecycle
  LEVEL_UP:           CANONICAL_EVENTS.LEVEL_UP,
  INACTIVE_3D:        CANONICAL_EVENTS.INACTIVE_3D,
  INACTIVE_7D:        CANONICAL_EVENTS.INACTIVE_7D,

  // ─ Economy
  PAYMENT_COMPLETED:  CANONICAL_EVENTS.PAYMENT_COMPLETED,
  COMMUNITY_JOINED:   CANONICAL_EVENTS.COMMUNITY_JOINED,

  // ─ Funnel attendance (set by canonical attendance trigger)
  SHOWED:             'showed',

  // ─ Outbound / nudge automations (currently emitted in edge functions)
  USER_INACTIVE_48H:  'etc.user_inactive_48h',
  USER_INACTIVE_7D:   'etc.user_inactive_7d',

  // ─ Community Path (P0 #1)
  PATH_STARTED:        'path_started',
  PATH_STEP_COMPLETED: 'path_step_completed',
  PATH_COMPLETED:      'path_completed',
  UPGRADE_CLICKED:     'upgrade_clicked',
  UPGRADE_CONVERTED:   'upgrade_converted',

  // ─ Quiz → Booking rescue
  RESCUE_SHOWN:        'rescue_shown',
  RESCUE_CLICKED:      'rescue_clicked',
  RESCUE_CONVERTED:    'rescue_converted',

  // ─ Internal queue control
  RETRY:               'retry',

  // ─ Funnel routing / lead lifecycle (production legacy — locked as canonical 2026-04-23)
  // Source: outbound_events scan against live data. Each name represents a
  // distinct lifecycle event already in production. Names are now part of
  // the canonical set so no existing write-site is forced to refactor, and
  // the soft-lock CHECK constraint can include them.
  NEW_LEAD:                'new_lead',
  LEAD_RETURNED:           'lead_returned',
  LEAD_ASSIGNED:           'lead_assigned',
  LEAD_ASSIGNED_CLOSER:    'lead_assigned_closer',
  MOVED_TO_CLOSER:         'moved_to_closer',
  SETTER_CONTACTING:       'setter_contacting',
  SETTER_QUALIFIED:        'setter_qualified',
  CLOSER_STARTED:          'closer_started',
  CALL_BOOKED:             'call_booked',
  BOOKING_CREATED:         'booking_created',
  OFFER_PRESENTED:         'offer_presented',
  OFFER_MADE:              'offer_made',
  PURCHASE_COMPLETED:      'purchase_completed',
  USER_STAGE_CHANGED:      'user_stage_changed',
  USER_STATUS_CHANGED:     'user_status_changed',
  STAGE_CHANGED:           'stage_changed',
  USER_CERTIFIED:          'user_certified',
  PLACEMENT_READY:         'placement_ready',
  MODULE_COMPLETED:        'module_completed',
  APPOINTMENT_REMINDER_24H: 'appointment.reminder_24h',

  // ─ Community events (production legacy — community_events.event_type)
  COMMUNITY_PRICING_VIEW:    'pricing_view',
  COMMUNITY_CTA_CLICK:       'cta_click',
  COMMUNITY_CHECKOUT_STARTED: 'checkout_started',
} as const);

export type CanonicalEventName = typeof EVENTS[keyof typeof EVENTS];

const CANONICAL_SET = new Set<string>(Object.values(EVENTS));

/** Pure predicate. Use before any insert into outbound_events. */
export function isCanonicalEventName(name: string): name is CanonicalEventName {
  return CANONICAL_SET.has(name);
}

/**
 * Throws in dev / logs in prod when a non-canonical event name is used.
 * Use at every write site:
 *   await supabase.from('outbound_events').insert({
 *     event_name: assertCanonicalEventName(EVENTS.NO_SHOW), ...
 *   });
 */
export function assertCanonicalEventName(name: string): string {
  if (!CANONICAL_SET.has(name)) {
    const msg =
      `[CanonicalEvents] Forbidden event name "${name}". ` +
      `Allowed: ${[...CANONICAL_SET].sort().join(', ')}`;
    if (import.meta.env?.DEV) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.error(msg);
  }
  return name;
}

/** Full list — useful for admin diagnostics & enum migration generation. */
export const ALL_CANONICAL_EVENTS: readonly CanonicalEventName[] =
  Object.freeze([...CANONICAL_SET].sort()) as readonly CanonicalEventName[];
