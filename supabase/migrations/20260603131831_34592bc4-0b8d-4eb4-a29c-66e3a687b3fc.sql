-- Weight history (every change in ab_slot_weights is captured here)
CREATE TABLE IF NOT EXISTS public.ab_weight_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL,
  variant text NOT NULL,
  weight numeric NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  is_winner boolean NOT NULL DEFAULT false,
  score numeric NOT NULL DEFAULT 0,
  exposures integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  bookings integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_weight_history_slot ON public.ab_weight_history (slot, recorded_at DESC);
GRANT SELECT ON public.ab_weight_history TO anon, authenticated;
GRANT ALL ON public.ab_weight_history TO service_role;
ALTER TABLE public.ab_weight_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_weight_history public read" ON public.ab_weight_history FOR SELECT USING (true);

-- Audit errors (self-check failures)
CREATE TABLE IF NOT EXISTS public.ab_audit_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  slot text,
  variant text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_audit_errors_recent ON public.ab_audit_errors (created_at DESC);
GRANT SELECT ON public.ab_audit_errors TO anon, authenticated;
GRANT ALL ON public.ab_audit_errors TO service_role;
ALTER TABLE public.ab_audit_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_audit_errors public read" ON public.ab_audit_errors FOR SELECT USING (true);

-- Attribution coverage snapshots
CREATE TABLE IF NOT EXISTS public.ab_attribution_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_days integer NOT NULL DEFAULT 14,
  total_conversions integer NOT NULL DEFAULT 0,
  attributed_conversions integer NOT NULL DEFAULT 0,
  coverage_pct numeric NOT NULL DEFAULT 0,
  by_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  forbidden_inputs_found jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_attribution_audit_recent ON public.ab_attribution_audit (created_at DESC);
GRANT SELECT ON public.ab_attribution_audit TO anon, authenticated;
GRANT ALL ON public.ab_attribution_audit TO service_role;
ALTER TABLE public.ab_attribution_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_attribution_audit public read" ON public.ab_attribution_audit FOR SELECT USING (true);