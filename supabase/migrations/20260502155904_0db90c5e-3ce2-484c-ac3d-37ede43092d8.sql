CREATE OR REPLACE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, full_name text, email text, level integer, role_label text, member_role text, appts_this_week bigint, show_rate numeric, close_rate numeric, bookings_total numeric, shows_total numeric, deals_total numeric, is_self boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT v_is_admin THEN
    IF v_root <> v_caller THEN
      RAISE EXCEPTION 'forbidden: cannot query other director teams';
    END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  RETURN QUERY
  WITH RECURSIVE
  unit_members AS (
    SELECT DISTINCT otm.member_id AS id
    FROM public.operator_team_members otm
    JOIN public.operator_units ou ON ou.id = otm.unit_id AND ou.status = 'active'
    WHERE ou.operator_id = v_root
       OR otm.unit_id IN (
         SELECT otm2.unit_id FROM public.operator_team_members otm2
         WHERE otm2.member_id = v_root AND otm2.active = true AND otm2.team_role = 'operator'
       )
  ),
  dir_sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN dir_sub s ON p.director_id = s.id
  ),
  members AS (
    SELECT id FROM unit_members UNION SELECT id FROM dir_sub UNION SELECT v_root
  ),
  week_appts AS (
    SELECT a.setter_id, COUNT(*)::bigint AS cnt
    FROM public.appointments a
    WHERE a.setter_id IN (SELECT id FROM members)
      AND a.starts_at >= date_trunc('week', now())
      AND a.starts_at < date_trunc('week', now()) + interval '7 days'
    GROUP BY a.setter_id
  )
  SELECT
    m.id, p.full_name, p.email,
    COALESCE(uls.current_level, 0),
    COALESCE(uls.current_role_label, p.business_stage),
    p.business_stage,
    COALESCE(wa.cnt, 0)::bigint,
    otp.close_rate, otp.close_rate,
    otp.bookings, otp.shows, otp.deals,
    (m.id = v_caller)
  FROM members m
  JOIN public.profiles p ON p.id = m.id
  LEFT JOIN public.user_level_status uls ON uls.user_id = m.id
  LEFT JOIN public.operator_team_performance otp ON otp.traffic_owner = m.id
  LEFT JOIN week_appts wa ON wa.setter_id = m.id
  ORDER BY
    (m.id = v_caller) DESC,
    otp.close_rate DESC NULLS LAST,
    COALESCE(uls.current_level, 0) DESC,
    COALESCE(p.full_name, p.email) NULLS LAST;
END;
$function$;