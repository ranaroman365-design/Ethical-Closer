-- ═══════════════════════════════════════════════════════════════════════
-- Canon Enforcement: Soft-Lock CHECK constraints on event tables
-- Source of truth: src/lib/canonical-events.ts (EVENTS registry)
-- NOT VALID = enforced for new rows only; legacy data preserved untouched.
-- ═══════════════════════════════════════════════════════════════════════

-- Drop any prior version (idempotent)
ALTER TABLE public.outbound_events
  DROP CONSTRAINT IF EXISTS outbound_events_event_name_canonical;

ALTER TABLE public.community_events
  DROP CONSTRAINT IF EXISTS community_events_event_type_canonical;

-- ─── outbound_events.event_name ────────────────────────────────────────
ALTER TABLE public.outbound_events
  ADD CONSTRAINT outbound_events_event_name_canonical
  CHECK (event_name IN (
    -- Acquisition (operational-canon Layer 12)
    'lead_created',
    'quiz_started',
    'quiz_completed',
    'booked',
    'no_show',
    'call_completed',
    'deal_won',
    'deal_lost',
    -- Lifecycle
    'level_up',
    'inactive_3d',
    'inactive_7d',
    -- Economy
    'payment_completed',
    'community_joined',
    -- Funnel attendance
    'showed',
    -- Outbound nudge automations (edge functions)
    'etc.user_inactive_48h',
    'etc.user_inactive_7d',
    -- Community Path (P0)
    'path_started',
    'path_step_completed',
    'path_completed',
    'upgrade_clicked',
    'upgrade_converted',
    -- Quiz → Booking rescue
    'rescue_shown',
    'rescue_clicked',
    'rescue_converted',
    -- Internal queue control
    'retry',
    -- Funnel routing / lead lifecycle (production legacy, locked)
    'new_lead',
    'lead_returned',
    'lead_assigned',
    'lead_assigned_closer',
    'moved_to_closer',
    'setter_contacting',
    'setter_qualified',
    'closer_started',
    'call_booked',
    'booking_created',
    'offer_presented',
    'offer_made',
    'purchase_completed',
    'user_stage_changed',
    'user_status_changed',
    'stage_changed',
    'user_certified',
    'placement_ready',
    'module_completed',
    'appointment.reminder_24h',
    -- Community events (also valid in outbound for cross-emit)
    'pricing_view',
    'cta_click',
    'checkout_started'
  ))
  NOT VALID;

COMMENT ON CONSTRAINT outbound_events_event_name_canonical ON public.outbound_events IS
  'Canon Layer 14 (Event Name Lock). Soft-lock: new rows must use an event_name from src/lib/canonical-events.ts EVENTS registry. Legacy rows preserved (NOT VALID). To extend: add to EVENTS, then re-run this migration.';

-- ─── community_events.event_type ───────────────────────────────────────
ALTER TABLE public.community_events
  ADD CONSTRAINT community_events_event_type_canonical
  CHECK (event_type IN (
    -- Community-specific events
    'pricing_view',
    'cta_click',
    'checkout_started',
    'community_joined',
    -- Path events
    'path_started',
    'path_step_completed',
    'path_completed',
    'upgrade_clicked',
    'upgrade_converted',
    -- Lifecycle events that can also surface in community context
    'inactive_3d',
    'inactive_7d',
    'level_up'
  ))
  NOT VALID;

COMMENT ON CONSTRAINT community_events_event_type_canonical ON public.community_events IS
  'Canon Layer 14 (Event Name Lock). Soft-lock: new rows must use an event_type from the canonical community event subset. Legacy rows preserved (NOT VALID).';