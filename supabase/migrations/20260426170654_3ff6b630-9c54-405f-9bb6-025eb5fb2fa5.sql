-- Drop and recreate the canonical event_name whitelist on outbound_events
-- to include the missing 2h and 10m appointment reminder events.
ALTER TABLE public.outbound_events
  DROP CONSTRAINT IF EXISTS outbound_events_event_name_canonical;

ALTER TABLE public.outbound_events
  ADD CONSTRAINT outbound_events_event_name_canonical
  CHECK (event_name = ANY (ARRAY[
    'lead_created','quiz_started','quiz_completed','booked','no_show',
    'call_completed','deal_won','deal_lost','level_up','inactive_3d','inactive_7d',
    'payment_completed','community_joined','showed',
    'etc.user_inactive_48h','etc.user_inactive_7d',
    'path_started','path_step_completed','path_completed',
    'upgrade_clicked','upgrade_converted',
    'rescue_shown','rescue_clicked','rescue_converted',
    'retry','new_lead','lead_returned','lead_assigned','lead_assigned_closer',
    'moved_to_closer','setter_contacting','setter_qualified','closer_started',
    'call_booked','booking_created','offer_presented','offer_made','purchase_completed',
    'user_stage_changed','user_status_changed','stage_changed','user_certified',
    'placement_ready','module_completed',
    'appointment.reminder_24h','appointment.reminder_2h','appointment.reminder_10m',
    'pricing_view','cta_click','checkout_started'
  ])) NOT VALID;