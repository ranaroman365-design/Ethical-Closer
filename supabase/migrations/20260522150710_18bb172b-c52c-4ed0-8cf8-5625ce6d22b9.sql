-- ab_slot_weights: per-variant weights for the auto-promoting multivariant layer
-- Public-read so the frontend can poll without auth; writes are service-role only.
CREATE TABLE IF NOT EXISTS public.ab_slot_weights (
  slot text NOT NULL,
  variant text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
  exposures integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  wilson_lower numeric NOT NULL DEFAULT 0,
  is_winner boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slot, variant)
);

CREATE INDEX IF NOT EXISTS idx_ab_slot_weights_slot ON public.ab_slot_weights (slot);

ALTER TABLE public.ab_slot_weights ENABLE ROW LEVEL SECURITY;

-- Public read so landing pages can fetch weights anonymously
DROP POLICY IF EXISTS "ab_slot_weights public read" ON public.ab_slot_weights;
CREATE POLICY "ab_slot_weights public read"
  ON public.ab_slot_weights FOR SELECT
  USING (true);

-- Only service role writes (via the rollup edge function); no insert/update policy for anon/authenticated.