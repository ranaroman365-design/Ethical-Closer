
INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'etc-internal', 'etc-internal')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  dns_status text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_domains_tenant ON public.partner_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_domains_status ON public.partner_domains(status);
ALTER TABLE public.partner_domains ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_domains' AND policyname='partner_domains_admin_all') THEN
    CREATE POLICY partner_domains_admin_all ON public.partner_domains FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;

INSERT INTO public.partner_domains (tenant_id, domain, status, verified_at) VALUES
  ('00000000-0000-0000-0000-000000000001','ethicalcloser.de','verified', now()),
  ('00000000-0000-0000-0000-000000000001','www.ethicalcloser.de','verified', now()),
  ('00000000-0000-0000-0000-000000000001','ethical-closing.lovable.app','verified', now())
ON CONFLICT (domain) DO NOTHING;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.leads SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON public.leads(tenant_id);

ALTER TABLE public.funnel_routing_config ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE public.funnel_routing_config SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_frc_tenant ON public.funnel_routing_config(tenant_id);

CREATE TABLE IF NOT EXISTS public.partner_tenant_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);
ALTER TABLE public.partner_tenant_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_tenant_assignments' AND policyname='pta_admin_all') THEN
    CREATE POLICY pta_admin_all ON public.partner_tenant_assignments FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_tenant_assignments' AND policyname='pta_self_read') THEN
    CREATE POLICY pta_self_read ON public.partner_tenant_assignments FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.partner_tenant_assignments
  WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads' AND policyname='leads_partner_admin_select') THEN
    CREATE POLICY leads_partner_admin_select ON public.leads FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(),'partner_admin') AND tenant_id = public.get_user_tenant_id(auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE VIEW public.partner_dashboard_view WITH (security_invoker = true) AS
SELECT
  l.tenant_id,
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE COALESCE(l.has_booking,false) = false) AS no_booking_leads,
  COUNT(*) FILTER (WHERE l.has_booking = true) AS booked_leads,
  COUNT(*) FILTER (WHERE l.no_show_flag = true) AS no_show_leads,
  COUNT(*) FILTER (WHERE l.outcome = 'no_close') AS no_close_leads,
  COUNT(*) FILTER (WHERE l.outcome IN ('won','closed_won')) AS closed_won_leads,
  COALESCE(SUM(l.deal_value) FILTER (WHERE l.outcome IN ('won','closed_won')), 0) AS revenue_estimate,
  MAX(l.last_action_at) AS last_activity_at
FROM public.leads l
WHERE COALESCE(l.is_simulation,false) = false
GROUP BY l.tenant_id;

CREATE OR REPLACE VIEW public.lead_segments WITH (security_invoker = true) AS
SELECT
  l.id AS lead_id, l.tenant_id,
  CASE
    WHEN COALESCE(l.has_booking,false)=false AND l.created_at > now() - interval '7 days'  THEN 'no_booking_7d'
    WHEN COALESCE(l.has_booking,false)=false AND l.created_at > now() - interval '14 days' THEN 'no_booking_14d'
    WHEN l.no_show_flag = true                                                              THEN 'no_show_recovery'
    WHEN l.outcome = 'no_close' AND l.closed_at > now() - interval '14 days'                THEN 'no_close_14d'
    WHEN l.last_action_at < now() - interval '30 days'                                      THEN 'cold_lead'
    WHEN l.outcome = 'no_close' AND COALESCE(l.deal_value,0) >= 5000                        THEN 'high_value_recovery_candidate'
    ELSE 'reactivation_candidate'
  END AS segment,
  l.has_booking, l.no_show_flag, l.outcome, l.deal_value, l.created_at, l.last_action_at
FROM public.leads l
WHERE COALESCE(l.is_simulation,false) = false;

CREATE TABLE IF NOT EXISTS public.level_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL,
  role_name text,
  kpi_key text NOT NULL,
  threshold_operator text NOT NULL CHECK (threshold_operator IN ('>=','<=','=','>','<')),
  threshold_value numeric NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, kpi_key)
);
ALTER TABLE public.level_requirements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='level_requirements' AND policyname='lr_read_all_auth') THEN
    CREATE POLICY lr_read_all_auth ON public.level_requirements FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='level_requirements' AND policyname='lr_admin_write') THEN
    CREATE POLICY lr_admin_write ON public.level_requirements FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;

INSERT INTO public.level_requirements (level, role_name, kpi_key, threshold_operator, threshold_value) VALUES
  ('L1','Opener','contact_rate','>=',35),
  ('L1','Opener','response_time','<=',60),
  ('L2','Associate Setter','booking_rate','>=',20),
  ('L2','Associate Setter','qualification_accuracy','>=',70),
  ('L2','Associate Setter','crm_hygiene_score','>=',95),
  ('L3','Senior Setter','show_rate','>=',65),
  ('L3','Senior Setter','qualification_accuracy','>=',80),
  ('L4','Junior Closer','closing_rate','>=',20),
  ('L4','Junior Closer','storno_rate','<=',10),
  ('L4','Junior Closer','crm_hygiene_score','>=',95),
  ('L4','Junior Closer','follow_up_rate','>=',95),
  ('L5','Manager Closer','calls_per_week','>=',3),
  ('L6','Operator','show_rate','>=',65),
  ('L7','Director','calls_handled','>=',1)
ON CONFLICT (level, kpi_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.operator_certification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_level text, to_level text,
  kpi_snapshot_id uuid, evidence jsonb,
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid, decision_type text, reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocl_user ON public.operator_certification_log(user_id);
ALTER TABLE public.operator_certification_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_certification_log' AND policyname='ocl_self_read') THEN
    CREATE POLICY ocl_self_read ON public.operator_certification_log FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_certification_log' AND policyname='ocl_admin_all') THEN
    CREATE POLICY ocl_admin_all ON public.operator_certification_log FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_level_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  level text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz, snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_olh_user ON public.operator_level_history(user_id);
ALTER TABLE public.operator_level_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_level_history' AND policyname='olh_self_read') THEN
    CREATE POLICY olh_self_read ON public.operator_level_history FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_level_history' AND policyname='olh_admin_all') THEN
    CREATE POLICY olh_admin_all ON public.operator_level_history FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.evaluate_operator_promotion_dry_run(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kpi public.member_kpis;
  v_req RECORD;
  v_actual numeric;
  v_passes boolean;
  v_met jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_levels text[] := ARRAY['L1','L2','L3','L4','L5','L6','L7'];
  v_lvl text;
  v_lvl_pass boolean;
  v_suggested text := NULL;
  v_total int := 0;
  v_passed int := 0;
BEGIN
  SELECT * INTO v_kpi FROM public.member_kpis WHERE user_id = _user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_kpi.user_id IS NULL THEN
    RETURN jsonb_build_object('error','no_kpi_snapshot','user_id',_user_id);
  END IF;

  FOREACH v_lvl IN ARRAY v_levels LOOP
    v_lvl_pass := true;
    FOR v_req IN SELECT * FROM public.level_requirements WHERE level = v_lvl AND active LOOP
      v_total := v_total + 1;
      BEGIN
        EXECUTE format('SELECT ($1).%I::numeric', v_req.kpi_key) INTO v_actual USING v_kpi;
      EXCEPTION WHEN OTHERS THEN
        v_actual := 0;
      END;
      v_actual := COALESCE(v_actual, 0);
      v_passes := CASE v_req.threshold_operator
        WHEN '>=' THEN v_actual >= v_req.threshold_value
        WHEN '<=' THEN v_actual <= v_req.threshold_value
        WHEN '='  THEN v_actual =  v_req.threshold_value
        WHEN '>'  THEN v_actual >  v_req.threshold_value
        WHEN '<'  THEN v_actual <  v_req.threshold_value
        ELSE false END;
      IF v_passes THEN
        v_passed := v_passed + 1;
        v_met := v_met || jsonb_build_object('level',v_lvl,'kpi',v_req.kpi_key,'actual',v_actual,'threshold',v_req.threshold_value);
      ELSE
        v_lvl_pass := false;
        v_failed := v_failed || jsonb_build_object('level',v_lvl,'kpi',v_req.kpi_key,'actual',v_actual,'threshold',v_req.threshold_value,'op',v_req.threshold_operator);
      END IF;
    END LOOP;
    IF v_lvl_pass THEN v_suggested := v_lvl; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'evaluated_at', now(),
    'suggested_level', v_suggested,
    'met_requirements', v_met,
    'failed_requirements', v_failed,
    'confidence_score', CASE WHEN v_total = 0 THEN 0 ELSE round((v_passed::numeric / v_total) * 100, 2) END,
    'recommendation', CASE WHEN v_suggested IS NULL THEN 'no_qualified_level' ELSE 'review_for_promotion' END,
    'dry_run', true,
    'writes', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_operator_promotion_dry_run(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.evaluate_operator_promotion_dry_run(uuid) TO authenticated, service_role;
