CREATE OR REPLACE FUNCTION public.get_team_today_overview(_director uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_total bigint;
  v_team_size int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT v_is_admin THEN
    IF v_root <> v_caller THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN RAISE EXCEPTION 'forbidden: requires Level 6+'; END IF;
  END IF;

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
  )
  SELECT COUNT(*) INTO v_team_size FROM members;

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
  )
  SELECT COUNT(*) INTO v_total
  FROM public.appointments a
  WHERE a.setter_id IN (SELECT id FROM members)
    AND a.starts_at >= date_trunc('day', now())
    AND a.starts_at < date_trunc('day', now()) + interval '1 day';

  RETURN jsonb_build_object('team_size', v_team_size, 'appts_today', v_total);
END;
$function$;