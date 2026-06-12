
-- Additive: Per-Channel Allocator + Decision Log for Auto A/B System.
-- Does NOT modify ab_experiments / ab_variants / ab_allocations.

CREATE TABLE IF NOT EXISTS public.ab_channel_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  channel text NOT NULL,                  -- meta | tiktok | google | retargeting | direct | other
  weight numeric NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),
  trials integer NOT NULL DEFAULT 0,
  successes integer NOT NULL DEFAULT 0,
  win_probability numeric,
  reward_mode text,                       -- 'primary' | 'composite'
  last_recomputed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, variant_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_ab_channel_weights_exp_channel
  ON public.ab_channel_weights (experiment_id, channel);

ALTER TABLE public.ab_channel_weights ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ab_channel_weights TO anon;
GRANT SELECT, INSERT, UPDATE ON public.ab_channel_weights TO authenticated;
GRANT ALL ON public.ab_channel_weights TO service_role;

CREATE POLICY "Public read channel weights"
  ON public.ab_channel_weights FOR SELECT USING (true);

CREATE POLICY "Admins write channel weights"
  ON public.ab_channel_weights FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- Append-only audit of every allocator decision (recompute, freeze, winner).
CREATE TABLE IF NOT EXISTS public.ab_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  channel text,                           -- null = global decision
  action text NOT NULL,                   -- 'recompute' | 'freeze_winner' | 'unfreeze' | 'skip_low_volume'
  reward_mode text,                       -- 'primary' | 'composite'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_decision_log_exp_time
  ON public.ab_decision_log (experiment_id, created_at DESC);

ALTER TABLE public.ab_decision_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ab_decision_log TO authenticated;
GRANT ALL ON public.ab_decision_log TO service_role;

CREATE POLICY "Admins read decision log"
  ON public.ab_decision_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));
