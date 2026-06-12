CREATE TABLE IF NOT EXISTS public.experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('assigned','exposed','converted')),
  visitor_id TEXT,
  session_id TEXT,
  conversion_event TEXT,
  is_holdout BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiment_events_key_created
  ON public.experiment_events (experiment_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiment_events_visitor
  ON public.experiment_events (visitor_id);
CREATE INDEX IF NOT EXISTS idx_experiment_events_type
  ON public.experiment_events (event_type);

ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert experiment events"
  ON public.experiment_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read experiment events"
  ON public.experiment_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));