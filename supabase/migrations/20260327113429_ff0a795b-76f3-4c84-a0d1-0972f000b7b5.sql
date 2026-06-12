
-- Approval requests for governance workflow
CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL DEFAULT 'version_proposal',
  reference_table text NOT NULL DEFAULT '',
  reference_id uuid DEFAULT NULL,
  requested_by uuid DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  decision_notes text DEFAULT NULL,
  decided_by uuid DEFAULT NULL,
  decided_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage approvals" ON public.approval_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read own approvals" ON public.approval_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

-- Monthly version proposals (groups proposal items by month)
CREATE TABLE public.monthly_version_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_month date NOT NULL,
  current_version text NOT NULL DEFAULT 'v1.0',
  proposed_version text NOT NULL DEFAULT 'v1.1',
  executive_summary text NOT NULL DEFAULT '',
  top_opportunities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz DEFAULT NULL,
  approved_by uuid DEFAULT NULL,
  UNIQUE(proposal_month)
);

ALTER TABLE public.monthly_version_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage monthly proposals" ON public.monthly_version_proposals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read monthly proposals" ON public.monthly_version_proposals
  FOR SELECT TO authenticated
  USING (true);

-- Add monthly_proposal_id to upgrade_proposals for linking
ALTER TABLE public.upgrade_proposals ADD COLUMN IF NOT EXISTS monthly_proposal_id uuid REFERENCES public.monthly_version_proposals(id) ON DELETE SET NULL;
ALTER TABLE public.upgrade_proposals ADD COLUMN IF NOT EXISTS why_it_matters text DEFAULT '';
ALTER TABLE public.upgrade_proposals ADD COLUMN IF NOT EXISTS linked_kpi_key text DEFAULT '';
ALTER TABLE public.upgrade_proposals ADD COLUMN IF NOT EXISTS recommended_version text DEFAULT '';
