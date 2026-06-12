-- Extend existing funnel_events_v2 (originally for origin attribution)
-- to also accept anonymous /closerpath funnel telemetry.

ALTER TABLE public.funnel_events_v2
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS event_source text NOT NULL DEFAULT 'closerpath',
  ADD COLUMN IF NOT EXISTS variant text;

-- Make lead_id optional so anonymous LP views can be tracked
ALTER TABLE public.funnel_events_v2 ALTER COLUMN lead_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fev2_source_created ON public.funnel_events_v2 (event_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fev2_event_type     ON public.funnel_events_v2 (event_type);
CREATE INDEX IF NOT EXISTS idx_fev2_email          ON public.funnel_events_v2 (email);

ALTER TABLE public.funnel_events_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fev2_insert_any" ON public.funnel_events_v2;
CREATE POLICY "fev2_insert_any"
  ON public.funnel_events_v2
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "fev2_select_admin" ON public.funnel_events_v2;
CREATE POLICY "fev2_select_admin"
  ON public.funnel_events_v2
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
