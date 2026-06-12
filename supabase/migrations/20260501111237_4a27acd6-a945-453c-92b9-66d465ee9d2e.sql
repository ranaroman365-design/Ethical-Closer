
-- Enforcement rules configuration
CREATE TABLE public.enforcement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  check_type text NOT NULL CHECK (check_type IN ('sla_breach','missing_followup','missing_call','no_show_unrecovered','no_close_no_followup','playbook_unread','no_owner','kpi_below_target')),
  threshold_hours numeric DEFAULT 24,
  escalation_stages jsonb NOT NULL DEFAULT '[{"level":1,"action":"reminder","delay_hours":0},{"level":2,"action":"reassign","delay_hours":4},{"level":3,"action":"escalate_l6","delay_hours":8}]',
  consequence text NOT NULL DEFAULT 'alert' CHECK (consequence IN ('alert','block','reassign')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enforcement_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read enforcement rules"
  ON public.enforcement_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage enforcement rules"
  ON public.enforcement_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enforcement violations
CREATE TABLE public.enforcement_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.enforcement_rules(id),
  lead_id uuid,
  operator_id uuid NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','escalated','resolved','overridden')),
  escalation_level int NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 3),
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  context jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enforcement_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators see own violations"
  ON public.enforcement_violations FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage violations"
  ON public.enforcement_violations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_enforcement_violations_operator ON public.enforcement_violations(operator_id);
CREATE INDEX idx_enforcement_violations_status ON public.enforcement_violations(status);
CREATE INDEX idx_enforcement_violations_rule ON public.enforcement_violations(rule_id);

-- Playbook acknowledgments
CREATE TABLE public.playbook_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL,
  playbook_key text NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operator_id, playbook_key, version)
);

ALTER TABLE public.playbook_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators see own acknowledgments"
  ON public.playbook_acknowledgments FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators create own acknowledgments"
  ON public.playbook_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid());

-- Operator blocks
CREATE TABLE public.operator_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL,
  block_type text NOT NULL CHECK (block_type IN ('no_new_leads','access_restricted','review_required')),
  reason text,
  enforcement_violation_id uuid REFERENCES public.enforcement_violations(id),
  is_active boolean NOT NULL DEFAULT true,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  unblocked_at timestamptz,
  unblocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators see own blocks"
  ON public.operator_blocks FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage blocks"
  ON public.operator_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_operator_blocks_active ON public.operator_blocks(operator_id) WHERE is_active = true;

-- Seed enforcement rules
INSERT INTO public.enforcement_rules (rule_key, title, description, check_type, threshold_hours, consequence) VALUES
  ('lead_contact_sla', 'Lead Contact SLA', 'Jeder Lead muss innerhalb von 24h kontaktiert werden', 'sla_breach', 24, 'alert'),
  ('followup_required', 'Follow-up Pflicht', 'Kein Lead ohne Follow-up nach Kontakt', 'missing_followup', 48, 'alert'),
  ('call_d2_execution', 'Day 2 Call Execution', 'Tag 2 Call muss durchgeführt werden', 'missing_call', 52, 'alert'),
  ('call_d4_execution', 'Day 4 Call Execution', 'Tag 4 Call muss durchgeführt werden', 'missing_call', 100, 'alert'),
  ('noshow_recovery', 'No-Show Recovery', 'Jeder No-Show muss bearbeitet werden', 'no_show_unrecovered', 4, 'reassign'),
  ('noclose_followup', 'No-Close Follow-up', 'Kein No-Close ohne Follow-up', 'no_close_no_followup', 24, 'alert'),
  ('playbook_read', 'Playbook Acknowledgment', 'Playbook muss gelesen und bestätigt werden', 'playbook_unread', 0, 'block'),
  ('lead_owner_required', 'Lead Owner Pflicht', 'Jeder Lead braucht genau einen Owner', 'no_owner', 0, 'reassign');

-- Trigger for updated_at on enforcement_rules
CREATE TRIGGER update_enforcement_rules_updated_at
  BEFORE UPDATE ON public.enforcement_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
