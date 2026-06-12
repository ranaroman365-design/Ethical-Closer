-- Sprint 3: A/B Testing, Release Governance, Recommendation Engine

CREATE TABLE IF NOT EXISTS public.experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  variant_key text NOT NULL DEFAULT 'control',
  label text NOT NULL DEFAULT '',
  is_control boolean NOT NULL DEFAULT false,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.experiment_variants(id) ON DELETE CASCADE,
  session_id text,
  profile_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.experiment_variants(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  primary_value numeric DEFAULT 0,
  secondary_value numeric,
  sample_size integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.release_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.release_versions(id) ON DELETE CASCADE,
  change_type text NOT NULL DEFAULT 'ui',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.release_versions
  ADD COLUMN IF NOT EXISTS related_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS related_experiment_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_kpis_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regression_checklist_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS post_release_review_json jsonb;

ALTER TABLE public.experiments
  ADD COLUMN IF NOT EXISTS linked_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS surface_type text DEFAULT 'landing_page',
  ADD COLUMN IF NOT EXISTS surface_key text DEFAULT '',
  ADD COLUMN IF NOT EXISTS traffic_allocation jsonb DEFAULT '{"control": 50, "variant_a": 50}'::jsonb;

ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage experiment variants" ON public.experiment_variants
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read experiment variants" ON public.experiment_variants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage experiment assignments" ON public.experiment_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users read own assignments" ON public.experiment_assignments
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins manage experiment results" ON public.experiment_results
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read experiment results" ON public.experiment_results
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage release changes" ON public.release_changes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read release changes" ON public.release_changes
  FOR SELECT TO authenticated USING (true);