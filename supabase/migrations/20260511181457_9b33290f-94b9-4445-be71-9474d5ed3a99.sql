
CREATE TABLE IF NOT EXISTS public.experiment_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key text NOT NULL,
  variant_id text NOT NULL,
  audience_cohort text NOT NULL DEFAULT 'default',
  recommended_weight numeric NOT NULL DEFAULT 1,
  exposures integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  posterior_mean numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  is_holdout boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_key, variant_id, audience_cohort)
);

CREATE INDEX IF NOT EXISTS idx_experiment_weights_lookup
  ON public.experiment_weights (experiment_key, audience_cohort);

ALTER TABLE public.experiment_weights ENABLE ROW LEVEL SECURITY;

-- Public read (so the unauthenticated /apply page can fetch weights).
CREATE POLICY "experiment_weights_public_read"
  ON public.experiment_weights
  FOR SELECT
  USING (true);

-- Only admins can insert/update/delete (the optimizer edge function uses
-- the service role and bypasses RLS).
CREATE POLICY "experiment_weights_admin_write"
  ON public.experiment_weights
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
