CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_events_v2_dedup_key
  ON public.funnel_events_v2 (dedup_key)
  WHERE dedup_key IS NOT NULL;