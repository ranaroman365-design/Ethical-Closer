ALTER TABLE public.community_events DROP CONSTRAINT IF EXISTS community_events_event_type_canonical;

ALTER TABLE public.community_events
  ADD CONSTRAINT community_events_event_type_canonical
  CHECK (event_type = ANY (ARRAY[
    'pricing_view','cta_click','checkout_started','community_joined',
    'path_started','path_step_completed','path_completed',
    'upgrade_clicked','upgrade_converted',
    'inactive_3d','inactive_7d','level_up',
    'post','comment'
  ])) NOT VALID;