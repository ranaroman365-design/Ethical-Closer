
-- Schema Contract Views v1

DROP VIEW IF EXISTS public.user_access_contract;
CREATE VIEW public.user_access_contract WITH (security_invoker = on) AS
SELECT
  p.id AS user_id,
  p.email,
  p.full_name,
  ur.role AS role_key,
  ur.role::text AS role_label,
  p.current_phase AS level,
  p.current_phase,
  p.business_stage,
  COALESCE(ur.role = 'admin', false) AS is_admin,
  (p.current_phase >= 6) AS is_operator,
  p.is_active,
  p.created_at
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id;
GRANT SELECT ON public.user_access_contract TO authenticated;

DROP VIEW IF EXISTS public.team_membership_contract;
CREATE VIEW public.team_membership_contract WITH (security_invoker = on) AS
SELECT
  p.director_id AS operator_id,
  p.id AS team_member_id,
  d.director_id AS manager_id,
  p.email AS member_email,
  p.full_name AS member_name,
  ur.role AS role_key,
  ur.role::text AS role_label,
  p.current_phase AS level,
  COALESCE(p.is_active, true) AS active,
  'direct_report' AS relationship_type
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN profiles d ON d.id = p.director_id
WHERE p.director_id IS NOT NULL;
GRANT SELECT ON public.team_membership_contract TO authenticated;

DROP VIEW IF EXISTS public.payment_contract;
CREATE VIEW public.payment_contract WITH (security_invoker = on) AS
SELECT
  pl.id AS payment_link_id, pl.lead_id, pl.session_id, pl.payment_intent_id,
  pl.amount, pl.currency, pl.status, pl.paid_at,
  pl.closer_id AS created_by, pl.deal_type AS product_key, pl.created_at
FROM payment_links pl;
GRANT SELECT ON public.payment_contract TO authenticated;

DROP VIEW IF EXISTS public.event_contract;
CREATE VIEW public.event_contract WITH (security_invoker = on) AS
SELECT
  pe.id, pe.event_key, pe.event_key AS event_id,
  pe.event_type AS event_name, pe.source_table,
  pe.source_ref AS lead_id, NULL::uuid AS user_id,
  pe.processed_at AS created_at, pe.result AS payload
FROM processed_events pe;
GRANT SELECT ON public.event_contract TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_schema_contract()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_errors jsonb := '[]'::jsonb; v_ok boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='user_access_contract') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"user_access_contract view missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='team_membership_contract') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"team_membership_contract view missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='payment_contract') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"payment_contract view missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='event_contract') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"event_contract view missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='operator_team_performance') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"operator_team_performance view missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='current_phase') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"profiles.current_phase missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='processed_events' AND column_name='event_key') INTO v_ok;
  IF NOT v_ok THEN v_errors := v_errors || '"processed_events.event_key missing"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='level') INTO v_ok;
  IF v_ok THEN v_errors := v_errors || '"FORBIDDEN: profiles.level exists"'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='current_stage') INTO v_ok;
  IF v_ok THEN v_errors := v_errors || '"FORBIDDEN: profiles.current_stage exists"'::jsonb; END IF;
  IF jsonb_array_length(v_errors) > 0 THEN RETURN jsonb_build_object('valid', false, 'errors', v_errors); END IF;
  RETURN jsonb_build_object('valid', true, 'errors', '[]'::jsonb, 'checked_at', now());
END; $$;
GRANT EXECUTE ON FUNCTION public.assert_schema_contract() TO authenticated;
