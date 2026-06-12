CREATE TABLE public.playbook_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type text NOT NULL CHECK (audit_type IN ('weekly', 'monthly')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_playbooks int DEFAULT 0,
  current_count int DEFAULT 0,
  partially_outdated_count int DEFAULT 0,
  outdated_count int DEFAULT 0,
  critically_wrong_count int DEFAULT 0,
  gaps_found int DEFAULT 0,
  summary jsonb DEFAULT '{}'::jsonb,
  triggered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.playbook_audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid NOT NULL REFERENCES public.playbook_audit_runs(id) ON DELETE CASCADE,
  playbook_key text NOT NULL,
  health_status text NOT NULL CHECK (health_status IN ('current', 'partially_outdated', 'outdated', 'critically_wrong')),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  extracted_processes jsonb DEFAULT '[]'::jsonb,
  extracted_events jsonb DEFAULT '[]'::jsonb,
  extracted_kpis jsonb DEFAULT '[]'::jsonb,
  extracted_statuses jsonb DEFAULT '[]'::jsonb,
  system_comparison jsonb DEFAULT '{}'::jsonb,
  ai_analysis text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.playbook_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid NOT NULL REFERENCES public.playbook_audit_runs(id) ON DELETE CASCADE,
  audit_result_id uuid REFERENCES public.playbook_audit_results(id) ON DELETE CASCADE,
  playbook_key text NOT NULL,
  gap_type text NOT NULL CHECK (gap_type IN ('undocumented_flow', 'missing_flow', 'kpi_mismatch', 'status_mismatch', 'event_mismatch', 'process_mismatch', 'missing_documentation')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description text NOT NULL,
  system_reference text,
  playbook_reference text,
  impact_area text CHECK (impact_area IN ('revenue', 'conversion', 'stability', 'compliance', 'other')),
  resolution_status text NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open', 'in_progress', 'resolved', 'accepted_risk')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.playbook_update_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid NOT NULL REFERENCES public.playbook_audit_runs(id) ON DELETE CASCADE,
  gap_id uuid REFERENCES public.playbook_gaps(id) ON DELETE SET NULL,
  playbook_key text NOT NULL,
  section_title text,
  old_text text NOT NULL,
  new_text text NOT NULL,
  rationale text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  approved_by uuid REFERENCES auth.users(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.playbook_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key text NOT NULL,
  version_from text,
  version_to text NOT NULL,
  change_description text NOT NULL,
  change_reason text NOT NULL,
  system_reference text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.playbook_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_update_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit runs" ON public.playbook_audit_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage audit results" ON public.playbook_audit_results FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage gaps" ON public.playbook_gaps FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage suggestions" ON public.playbook_update_suggestions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage change log" ON public.playbook_change_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_pb_audit_results_run ON public.playbook_audit_results(audit_run_id);
CREATE INDEX idx_pb_gaps_run ON public.playbook_gaps(audit_run_id);
CREATE INDEX idx_pb_gaps_key ON public.playbook_gaps(playbook_key);
CREATE INDEX idx_pb_suggestions_run ON public.playbook_update_suggestions(audit_run_id);
CREATE INDEX idx_pb_changelog_key ON public.playbook_change_log(playbook_key);