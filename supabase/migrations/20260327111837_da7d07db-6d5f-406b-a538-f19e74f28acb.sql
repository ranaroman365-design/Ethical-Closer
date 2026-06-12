
-- Experiments / A/B Tests tracking
CREATE TABLE public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hypothesis text NOT NULL DEFAULT '',
  variant_a text NOT NULL DEFAULT '',
  variant_b text NOT NULL DEFAULT '',
  target_segment text NOT NULL DEFAULT '',
  primary_kpi text NOT NULL DEFAULT '',
  secondary_kpi text DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  success_criterion text DEFAULT '',
  winner text DEFAULT NULL,
  created_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz DEFAULT NULL
);

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage experiments" ON public.experiments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read experiments" ON public.experiments
  FOR SELECT TO authenticated
  USING (true);

-- Release versions
CREATE TABLE public.release_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label text NOT NULL,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed',
  proposed_by uuid DEFAULT NULL,
  approved_by uuid DEFAULT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz DEFAULT NULL,
  deployed_at timestamptz DEFAULT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks text DEFAULT ''
);

ALTER TABLE public.release_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage releases" ON public.release_versions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read releases" ON public.release_versions
  FOR SELECT TO authenticated
  USING (true);

-- System audit reports
CREATE TABLE public.system_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL DEFAULT 'weekly',
  overall_score numeric NOT NULL DEFAULT 0,
  stability_score numeric DEFAULT 0,
  logic_score numeric DEFAULT 0,
  ux_score numeric DEFAULT 0,
  funnel_score numeric DEFAULT 0,
  data_score numeric DEFAULT 0,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT NULL
);

ALTER TABLE public.system_audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit reports" ON public.system_audit_reports
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Upgrade proposals (monthly)
CREATE TABLE public.upgrade_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid REFERENCES public.release_versions(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'product',
  problem text NOT NULL DEFAULT '',
  proposed_solution text NOT NULL DEFAULT '',
  target_segment text DEFAULT '',
  affected_kpi text DEFAULT '',
  expected_impact text NOT NULL DEFAULT 'medium',
  complexity text NOT NULL DEFAULT 'medium',
  risk text DEFAULT 'low',
  status text NOT NULL DEFAULT 'proposed',
  approved_by uuid DEFAULT NULL,
  approved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upgrade_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage proposals" ON public.upgrade_proposals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read proposals" ON public.upgrade_proposals
  FOR SELECT TO authenticated
  USING (true);
