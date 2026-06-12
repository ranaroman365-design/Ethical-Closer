
-- STEP 1: Add product_key to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS product_key text DEFAULT 'etc';

CREATE INDEX IF NOT EXISTS idx_rooms_product_key
  ON public.rooms (product_key);

-- STEP 2: Add columns to user_streaks
ALTER TABLE public.user_streaks
  ADD COLUMN IF NOT EXISTS week_start date
    DEFAULT date_trunc('week', now())::date,
  ADD COLUMN IF NOT EXISTS total_actions int DEFAULT 0;

-- STEP 3: stripe_events table
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type      text NOT NULL,
  user_id         uuid,
  processed_at    timestamptz DEFAULT now(),
  payload         jsonb
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stripe_events_admin_only"
  ON public.stripe_events FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
  );
