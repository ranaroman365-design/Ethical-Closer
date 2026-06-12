CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  user_id uuid REFERENCES public.profiles(id),
  processed_at timestamptz DEFAULT now(),
  payload jsonb
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only stripe_events" ON public.stripe_events
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
  );