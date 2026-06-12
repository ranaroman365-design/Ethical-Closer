
-- Fix canonical_role_for_level search_path
CREATE OR REPLACE FUNCTION public.canonical_role_for_level(_level int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _level
    WHEN 1 THEN 'opener'
    WHEN 2 THEN 'associate_setter'
    WHEN 3 THEN 'senior_setter'
    WHEN 4 THEN 'junior_closer'
    WHEN 5 THEN 'managing_closer'
    WHEN 6 THEN 'senior_closer'
    WHEN 7 THEN 'director'
    WHEN 8 THEN 'admin'
    ELSE 'unknown'
  END;
$$;

-- Update get_unit_drilldown to filter active members only
CREATE OR REPLACE FUNCTION public.get_unit_drilldown(p_unit_id uuid, p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      WHERE otm.unit_id = p_unit_id AND otm.active = true
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
          AND (ra.setter_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id AND otm.active = true)
            OR ra.closer_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id AND otm.active = true))
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
          AND c2.user_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = p_unit_id AND otm.active = true)
        ORDER BY c2.created_at DESC LIMIT 50) c
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Drop and recreate get_operator_unit_performance with active filter
DROP FUNCTION IF EXISTS public.get_operator_unit_performance(int);

CREATE FUNCTION public.get_operator_unit_performance(p_range_days int DEFAULT 30)
RETURNS TABLE(
  unit_id uuid, unit_name text, funnel_path text,
  operator_name text, operator_id uuid, team_size int,
  leads_count bigint, appointments_count bigint, shows_count bigint,
  closes_count bigint, revenue numeric, close_rate numeric, show_rate numeric,
  is_unassigned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND otm.active = true
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
      COALESCE(SUM(pl.amount) FILTER (WHERE pl.status = 'paid'), 0)::numeric / 100.0 AS rev
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
$$;
