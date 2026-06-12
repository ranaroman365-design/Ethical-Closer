-- Auto A/B System (Phase 1, LP-only, additive)
-- 3 new tables. No changes to existing tables, events, or functions.

CREATE TABLE public.ab_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','won','archived')),
  scope TEXT NOT NULL DEFAULT 'lp' CHECK (scope IN ('lp','quiz','booking')),
  primary_metric TEXT NOT NULL DEFAULT 'quiz_start_rate',
  guardrail_metric TEXT DEFAULT 'booking_rate',
  min_samples_per_variant INTEGER NOT NULL DEFAULT 200,
  significance_alpha NUMERIC NOT NULL DEFAULT 0.05,
  min_lift_pct NUMERIC NOT NULL DEFAULT 10,
  allocator TEXT NOT NULL DEFAULT 'thompson' CHECK (allocator IN ('thompson','equal','frozen')),
  winner_variant_id UUID,
  last_recomputed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ab_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_control BOOLEAN NOT NULL DEFAULT false,
  weight NUMERIC NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, key)
);

CREATE TABLE public.ab_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  landing_path TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, session_id)
);

CREATE INDEX idx_ab_allocations_exp_variant ON public.ab_allocations(experiment_id, variant_id);
CREATE INDEX idx_ab_allocations_session ON public.ab_allocations(session_id);
CREATE INDEX idx_ab_allocations_created ON public.ab_allocations(created_at);
CREATE INDEX idx_ab_variants_exp_active ON public.ab_variants(experiment_id, is_active);

GRANT SELECT ON public.ab_experiments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_experiments TO authenticated;
GRANT ALL ON public.ab_experiments TO service_role;

GRANT SELECT ON public.ab_variants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_variants TO authenticated;
GRANT ALL ON public.ab_variants TO service_role;

GRANT SELECT, INSERT ON public.ab_allocations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_allocations TO authenticated;
GRANT ALL ON public.ab_allocations TO service_role;

ALTER TABLE public.ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_allocations ENABLE ROW LEVEL SECURITY;

-- Public can read running experiments/variants (needed by client allocator)
CREATE POLICY "Public read experiments" ON public.ab_experiments FOR SELECT USING (true);
CREATE POLICY "Public read variants" ON public.ab_variants FOR SELECT USING (true);

-- Public can insert their own allocation row (anonymous traffic), but not read others'
CREATE POLICY "Public insert allocations" ON public.ab_allocations FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read allocations" ON public.ab_allocations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Admins manage experiments + variants
CREATE POLICY "Admins write experiments" ON public.ab_experiments FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins write variants" ON public.ab_variants FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- updated_at triggers
CREATE TRIGGER trg_ab_experiments_updated
  BEFORE UPDATE ON public.ab_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_ab_variants_updated
  BEFORE UPDATE ON public.ab_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();