
-- Drop functions first (return type change)
DROP FUNCTION IF EXISTS public.get_operator_unit_performance(integer);
DROP FUNCTION IF EXISTS public.get_unit_drilldown(uuid, integer);

-- Drop views
DROP VIEW IF EXISTS public.real_kpi_snapshot CASCADE;
DROP VIEW IF EXISTS public.real_leads_view CASCADE;

-- Recreate real_leads_view with unit_id
CREATE VIEW public.real_leads_view AS
SELECT id, created_at, updated_at, name, email, phone, source, stage,
  owner_id, owner_role, setter_id, closer_id,
  qualification_checklist, setter_notes, closer_notes,
  appointment_date, deal_value, created_by,
  contact_count, first_action_at, last_action_at, timer_expires_at,
  referrer_user_id, lead_level, quiz_score, quiz_result,
  is_simulation, simulation_batch_id,
  lead_score, lead_quality, scored_at,
  quiz_funnel_source, quiz_answers,
  lead_status, booking_status, source_funnel,
  has_booking, booking_id,
  next_action_type, next_action_at, priority_flag,
  reschedule_count, last_reschedule_at,
  outcome, close_reason, follow_up_date, closed_at,
  qualification_score, qualification_bucket, qualification_path,
  setter_budget_readiness, setter_decision_readiness,
  setter_problem_clarity, setter_recommendation,
  setter_qualification_score, setter_call_outcome,
  setter_follow_up_date, setter_call_completed_at,
  setter_lead_uniqueness, setter_closing_insights,
  total_calls_booked, total_calls_attended, total_no_shows,
  last_call_status, last_reminder_sent_at, reminder_count,
  no_show_flag, rebooked_flag, no_show_risk_score,
  origin_type, origin_id, funnel_id,
  quiz_completed_at, retargeting_state,
  payment_status, payment_recovery_state,
  retargeting_ab_variants, last_quiz_completed_at, quiz_attempt_count,
  funnel_source, traffic_owner,
  do_not_contact, consent_phone, suppression_reason, suppressed_at,
  preferred_calendar,
  unit_id,
  assigned_operator_id,
  canonical_funnel_source(source) AS canonical_source
FROM leads l
WHERE NOT is_test_lead(is_simulation, source, name);

-- Recreate real_kpi_snapshot
CREATE VIEW public.real_kpi_snapshot AS
WITH rl AS (
  SELECT id FROM real_leads_view WHERE created_at >= (now() - '30 days'::interval)
), stats AS (
  SELECT
    (SELECT count(*) FROM rl) AS total_leads,
    count(DISTINCT a.lead_id) AS booked,
    count(DISTINCT a.lead_id) FILTER (WHERE a.attendance_flag = true OR a.appointment_status = 'completed') AS shows,
    count(DISTINCT a.lead_id) FILTER (
      WHERE (a.appointment_status = 'no_show' OR (a.attendance_flag = false AND a.appointment_status NOT IN ('expired','superseded','cancelled','pending','scheduled')))
        AND NOT (a.lead_id IN (SELECT appointments.lead_id FROM appointments WHERE appointments.attendance_flag = true OR appointments.appointment_status = 'completed'))
    ) AS no_shows
  FROM rl LEFT JOIN appointments a ON a.lead_id = rl.id
), rev AS (
  SELECT
    count(*) FILTER (WHERE l.outcome = 'won' OR l.payment_status = 'paid') AS closed,
    COALESCE(sum(l.deal_value) FILTER (WHERE l.outcome = 'won' OR l.payment_status = 'paid'), 0) AS revenue
  FROM real_leads_view l WHERE l.created_at >= (now() - '30 days'::interval)
)
SELECT s.total_leads, s.booked, s.shows, s.no_shows, r.closed,
  CASE WHEN s.total_leads > 0 THEN s.booked - s.shows - s.no_shows ELSE 0::bigint END AS no_close,
  r.revenue,
  CASE WHEN s.total_leads > 0 THEN r.revenue / s.total_leads::numeric ELSE 0 END AS revenue_per_lead,
  CASE WHEN s.shows > 0 THEN r.revenue / s.shows::numeric ELSE 0 END AS revenue_per_show,
  CASE WHEN s.total_leads > 0 THEN round(s.booked::numeric / s.total_leads::numeric * 100, 1) ELSE 0 END AS booking_rate,
  CASE WHEN s.booked > 0 THEN round(s.shows::numeric / s.booked::numeric * 100, 1) ELSE 0 END AS show_rate,
  CASE WHEN s.shows > 0 THEN round(r.closed::numeric / s.shows::numeric * 100, 1) ELSE 0 END AS close_rate
FROM stats s, rev r;

-- Create get_operator_unit_performance with is_setup_pending
CREATE FUNCTION public.get_operator_unit_performance(p_range_days integer DEFAULT 30)
RETURNS TABLE(
  unit_id uuid, unit_name text, funnel_path text,
  operator_name text, operator_id uuid, team_size integer,
  total_leads bigint, total_appointments bigint, total_shows bigint,
  total_closes bigint, total_revenue numeric, close_rate numeric, show_rate numeric,
  is_setup_pending boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_cutoff timestamptz := now() - (p_range_days || ' days')::interval;
  v_caller uuid := auth.uid();
  v_level int;
  v_is_admin boolean;
BEGIN
  SELECT current_phase INTO v_level FROM profiles WHERE id = v_caller;
  v_is_admin := has_role(v_caller, 'admin') OR has_role(v_caller, 'owner') OR COALESCE(v_level, 0) >= 8;

  RETURN QUERY
  WITH accessible_units AS (
    SELECT ou.id, ou.unit_name, ou.funnel_path, ou.operator_id
    FROM operator_units ou
    WHERE ou.status = 'active'
      AND (
        v_is_admin
        OR (v_level = 7 AND ou.id IN (SELECT get_director_unit_ids(v_caller)))
        OR (v_level = 6 AND ou.id IN (SELECT get_user_unit_ids(v_caller)))
      )
  ),
  unit_member_ids AS (
    SELECT otm.unit_id AS uid, otm.member_id
    FROM operator_team_members otm
    WHERE otm.unit_id IN (SELECT au.id FROM accessible_units au)
  ),
  lead_counts AS (
    SELECT rl.unit_id AS uid, COUNT(*)::bigint AS cnt
    FROM real_leads_view rl
    WHERE rl.created_at >= v_cutoff
      AND rl.unit_id IN (SELECT au.id FROM accessible_units au)
    GROUP BY rl.unit_id
  ),
  appt_stats AS (
    SELECT
      um.uid,
      COUNT(*)::bigint AS total_appts,
      COUNT(*) FILTER (
        WHERE ra.appointment_status NOT IN ('no_show','cancelled','expired','superseded')
          AND (ra.completed_at IS NOT NULL OR ra.call_started_at IS NOT NULL)
          AND ra.starts_at <= now()
      )::bigint AS showed
    FROM real_appointments_view ra
    JOIN unit_member_ids um ON (ra.setter_id = um.member_id OR ra.closer_id = um.member_id)
    WHERE ra.starts_at >= v_cutoff
    GROUP BY um.uid
  ),
  revenue_stats AS (
    SELECT
      um.uid,
      COUNT(*) FILTER (WHERE pl.status = 'paid')::bigint AS closes,
      COALESCE(SUM(pl.amount) FILTER (WHERE pl.status = 'paid'), 0)::numeric AS rev
    FROM payment_links pl
    JOIN unit_member_ids um ON pl.closer_id = um.member_id
    WHERE pl.created_at >= v_cutoff
    GROUP BY um.uid
  )
  SELECT
    au.id,
    au.unit_name,
    au.funnel_path,
    COALESCE(p.full_name, 'Unassigned'),
    au.operator_id,
    (SELECT COUNT(*)::int FROM unit_member_ids um WHERE um.uid = au.id),
    COALESCE(lc.cnt, 0),
    COALESCE(ast.total_appts, 0),
    COALESCE(ast.showed, 0),
    COALESCE(rs.closes, 0),
    COALESCE(rs.rev, 0),
    CASE WHEN COALESCE(ast.showed, 0) > 0
      THEN ROUND(COALESCE(rs.closes, 0)::numeric / ast.showed * 100, 1)
      ELSE 0 END,
    CASE WHEN COALESCE(ast.total_appts, 0) > 0
      THEN ROUND(COALESCE(ast.showed, 0)::numeric / ast.total_appts * 100, 1)
      ELSE 0 END,
    (au.operator_id IS NULL)
  FROM accessible_units au
  LEFT JOIN profiles p ON p.id = au.operator_id
  LEFT JOIN lead_counts lc ON lc.uid = au.id
  LEFT JOIN appt_stats ast ON ast.uid = au.id
  LEFT JOIN revenue_stats rs ON rs.uid = au.id
  ORDER BY au.unit_name;
END;
$fn$;

-- Create get_unit_drilldown with full chain
CREATE FUNCTION public.get_unit_drilldown(p_unit_id uuid, p_range_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_level int;
  v_is_admin boolean;
  v_result jsonb;
  v_cutoff timestamptz := now() - (p_range_days || ' days')::interval;
BEGIN
  SELECT current_phase INTO v_level FROM profiles WHERE id = v_caller;
  v_is_admin := has_role(v_caller, 'admin') OR has_role(v_caller, 'owner') OR COALESCE(v_level, 0) >= 8;

  IF NOT v_is_admin THEN
    IF v_level = 7 AND p_unit_id NOT IN (SELECT get_director_unit_ids(v_caller)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF v_level = 6 AND p_unit_id NOT IN (SELECT get_user_unit_ids(v_caller)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF COALESCE(v_level, 0) < 6 THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'unit', (SELECT row_to_json(ou.*) FROM operator_units ou WHERE ou.id = p_unit_id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'member_id', otm.member_id,
        'team_role', otm.team_role,
        'full_name', p.full_name,
        'email', p.email,
        'level', p.current_phase,
        'leads_count', (SELECT COUNT(*) FROM real_leads_view rl
          WHERE rl.created_at >= v_cutoff
            AND (rl.owner_id = otm.member_id OR rl.setter_id = otm.member_id OR rl.closer_id = otm.member_id)),
        'appointments_count', (SELECT COUNT(*) FROM real_appointments_view ra
          WHERE ra.starts_at >= v_cutoff
            AND (ra.setter_id = otm.member_id OR ra.closer_id = otm.member_id)),
        'calls_count', (SELECT COUNT(*) FROM calls c
          WHERE c.created_at >= v_cutoff AND NOT COALESCE(c.is_simulation, false)
            AND c.user_id = otm.member_id),
        'revenue', (SELECT COALESCE(SUM(pl.amount), 0) FROM payment_links pl
          WHERE pl.created_at >= v_cutoff AND pl.status = 'paid'
            AND pl.closer_id = otm.member_id),
        'commissions_total', (SELECT COALESCE(SUM(cm.amount), 0) FROM commissions cm
          WHERE cm.created_at >= v_cutoff AND NOT COALESCE(cm.is_simulation, false)
            AND cm.user_id = otm.member_id)
      ))
      FROM operator_team_members otm
      JOIN profiles p ON p.id = otm.member_id
      WHERE otm.unit_id = p_unit_id
    ), '[]'::jsonb),
    'recent_leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rl.id, 'name', rl.name, 'source', rl.source,
        'stage', rl.stage, 'created_at', rl.created_at,
        'deal_value', rl.deal_value,
        'source_funnel', rl.source_funnel,
        'owner_id', rl.owner_id, 'setter_id', rl.setter_id, 'closer_id', rl.closer_id,
        'booking_status', rl.booking_status, 'outcome', rl.outcome,
        'payment_status', rl.payment_status, 'no_show_flag', rl.no_show_flag,
        'closed_at', rl.closed_at
      ) ORDER BY rl.created_at DESC)
      FROM (SELECT * FROM real_leads_view rl2
        WHERE rl2.unit_id = p_unit_id AND rl2.created_at >= v_cutoff
        ORDER BY rl2.created_at DESC LIMIT 50) rl
    ), '[]'::jsonb),
    'recent_appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'lead_id', a.lead_id,
        'starts_at', a.starts_at, 'appointment_status', a.appointment_status,
        'setter_id', a.setter_id, 'closer_id', a.closer_id,
        'assigned_operator_id', a.assigned_operator_id,
        'attendance_flag', a.attendance_flag,
        'call_started_at', a.call_started_at, 'completed_at', a.completed_at,
        'outcome', a.outcome
      ) ORDER BY a.starts_at DESC)
      FROM (SELECT * FROM real_appointments_view ra
        WHERE ra.starts_at >= v_cutoff
          AND (ra.setter_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id)
            OR ra.closer_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id))
        ORDER BY ra.starts_at DESC LIMIT 50) a
    ), '[]'::jsonb),
    'recent_calls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id,
        'result', c.result, 'revenue', c.revenue,
        'closed_at', c.closed_at, 'created_at', c.created_at,
        'lead_id', c.lead_id, 'appointment_id', c.appointment_id,
        'payment_link_id', c.payment_link_id
      ) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM calls c2
        WHERE c2.created_at >= v_cutoff AND NOT COALESCE(c2.is_simulation, false)
          AND c2.user_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id)
        ORDER BY c2.created_at DESC LIMIT 50) c
    ), '[]'::jsonb),
    'recent_payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pl.id, 'lead_id', pl.lead_id,
        'closer_id', pl.closer_id, 'amount', pl.amount,
        'status', pl.status, 'paid_at', pl.paid_at,
        'refunded_at', pl.refunded_at, 'disputed_at', pl.disputed_at,
        'created_at', pl.created_at,
        'call_id', pl.call_id, 'appointment_id', pl.appointment_id
      ) ORDER BY pl.created_at DESC)
      FROM (SELECT * FROM payment_links pl2
        WHERE pl2.created_at >= v_cutoff
          AND pl2.closer_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id)
        ORDER BY pl2.created_at DESC LIMIT 50) pl
    ), '[]'::jsonb),
    'recent_commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cm.id, 'call_id', cm.call_id,
        'user_id', cm.user_id, 'role', cm.role,
        'amount', cm.amount, 'payout_status', cm.payout_status,
        'eligible_at', cm.eligible_at, 'paid_at', cm.paid_at,
        'created_at', cm.created_at
      ) ORDER BY cm.created_at DESC)
      FROM (SELECT * FROM commissions cm2
        WHERE cm2.created_at >= v_cutoff AND NOT COALESCE(cm2.is_simulation, false)
          AND cm2.user_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id)
        ORDER BY cm2.created_at DESC LIMIT 50) cm
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

-- Harden RLS
DROP POLICY IF EXISTS "Admins manage operator units" ON operator_units;
CREATE POLICY "L8 Admin manage operator units" ON operator_units
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner')
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 8)
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner')
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 8)
);
CREATE POLICY "L7 manages director area units" ON operator_units
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 7)
  AND id IN (SELECT get_director_unit_ids(auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 7)
  AND id IN (SELECT get_director_unit_ids(auth.uid()))
);
CREATE POLICY "L6 manages own unit" ON operator_units
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 6)
  AND id IN (SELECT get_user_unit_ids(auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 6)
  AND id IN (SELECT get_user_unit_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Admins and L6+ manage team assignments" ON operator_team_members;
CREATE POLICY "L8 Admin manage team members" ON operator_team_members
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner')
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 8)
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner')
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 8)
);
CREATE POLICY "L7 manages director area team" ON operator_team_members
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 7)
  AND unit_id IN (SELECT get_director_unit_ids(auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 7)
  AND unit_id IN (SELECT get_director_unit_ids(auth.uid()))
);
CREATE POLICY "L6 manages own unit team" ON operator_team_members
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 6)
  AND unit_id IN (SELECT get_user_unit_ids(auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 6)
  AND unit_id IN (SELECT get_user_unit_ids(auth.uid()))
);
