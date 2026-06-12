
-- Decision Policies
CREATE TABLE public.decision_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text UNIQUE NOT NULL,
  policy_name text NOT NULL,
  decision_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium',
  applies_to_role text,
  applies_to_export_type text,
  applies_to_tenant_type text,
  condition_json jsonb DEFAULT '{}'::jsonb,
  default_route text NOT NULL DEFAULT 'owner',
  auto_approve boolean DEFAULT false,
  auto_deny boolean DEFAULT false,
  owner_only boolean DEFAULT false,
  enabled boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

ALTER TABLE public.decision_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only_decision_policies" ON public.decision_policies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Decision Requests
CREATE TABLE public.decision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL,
  source_table text,
  source_id text,
  tenant_id uuid,
  requester_user_id uuid,
  current_route text DEFAULT 'pending',
  current_status text DEFAULT 'pending',
  severity text DEFAULT 'medium',
  risk_score integer DEFAULT 0,
  reason text,
  context_json jsonb DEFAULT '{}'::jsonb,
  recommended_action text,
  recommended_route text,
  policy_key text,
  owner_required boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);

ALTER TABLE public.decision_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only_decision_requests" ON public.decision_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Decision History
CREATE TABLE public.decision_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_request_id uuid REFERENCES public.decision_requests(id) ON DELETE CASCADE NOT NULL,
  previous_route text,
  new_route text,
  action_taken text NOT NULL,
  actor_user_id uuid,
  actor_role text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.decision_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only_decision_history" ON public.decision_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Prompt Change Requests
CREATE TABLE public.prompt_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL,
  requester_user_id uuid NOT NULL,
  tenant_id uuid,
  request_type text NOT NULL CHECK (request_type IN ('new_prompt','change_request','sandbox_test','deploy_request','rollback_request')),
  status text DEFAULT 'pending',
  rationale text,
  proposal_summary text,
  sandbox_ref text,
  owner_review_required boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.prompt_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only_prompt_change_requests" ON public.prompt_change_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Integration Health Events
CREATE TABLE public.integration_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL,
  provider text NOT NULL,
  tenant_id uuid,
  severity text DEFAULT 'medium',
  event_type text NOT NULL,
  summary text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.integration_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only_integration_health" ON public.integration_health_events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Owner Watchlist
CREATE TABLE public.owner_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_type text NOT NULL,
  target_type text NOT NULL,
  target_ref text NOT NULL,
  tenant_id uuid,
  severity text DEFAULT 'medium',
  reason text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.owner_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only_watchlist" ON public.owner_watchlist FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Seed default decision policies
INSERT INTO public.decision_policies (policy_key, policy_name, decision_type, risk_level, default_route, auto_approve, owner_only) VALUES
  ('EXP-01', 'Finance Summary Export', 'export_approval', 'low', 'finance_admin', true, false),
  ('EXP-02', 'Tenant Partial Export', 'export_approval', 'medium', 'security_admin', false, false),
  ('EXP-03', 'Tenant Full Export', 'export_approval', 'high', 'owner', false, true),
  ('EXP-04', 'Prompt Export', 'export_approval', 'critical', 'owner', false, true),
  ('EXP-05', 'Config Export', 'export_approval', 'critical', 'owner', false, true),
  ('ESC-01', 'Short-lived Support Access', 'role_escalation', 'low', 'security_admin', false, false),
  ('ESC-02', 'Tenant-limited Ops Access', 'role_escalation', 'medium', 'security_admin', false, false),
  ('ESC-03', 'Cross-tenant Critical Access', 'role_escalation', 'critical', 'owner', false, true),
  ('PRM-01', 'Prompt Deploy', 'prompt_governance', 'critical', 'owner', false, true),
  ('PRM-02', 'Prompt Rollback', 'prompt_governance', 'critical', 'owner', false, true),
  ('PRM-03', 'Sandbox Test Request', 'prompt_governance', 'low', 'system_auto', true, false),
  ('INT-01', 'Webhook Health Issue', 'integration', 'medium', 'security_admin', false, false),
  ('INT-02', 'Credential Rotation', 'integration', 'high', 'owner', false, true),
  ('INT-03', 'New Integration Onboarding', 'integration', 'high', 'owner', false, true);
