CREATE OR REPLACE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  level integer,
  role_label text,
  member_role text,
  appts_this_week bigint,
  show_rate numeric,
  close_rate numeric,
  bookings_total numeric,
  shows_total numeric,
  deals_total numeric,
  is_self boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false)
                     OR COALESCE(public.has_role(auth.uid(), 'owner'::public.app_role), false);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_root IS NULL THEN
    RAISE EXCEPTION 'director required';
  END IF;

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
    JOIN public.operator_units ou
      ON ou.id = otm.unit_id
     AND ou.status = 'active'
    WHERE otm.active = true
      AND (
        ou.operator_id = v_root
        OR otm.unit_id IN (
          SELECT otm2.unit_id
          FROM public.operator_team_members otm2
          WHERE otm2.member_id = v_root
            AND otm2.active = true
            AND otm2.team_role = 'operator'
        )
      )
  ),
  contract_members AS (
    SELECT DISTINCT tmc.team_member_id AS id
    FROM public.team_membership_contract tmc
    WHERE tmc.operator_id = v_root
      AND COALESCE(tmc.active, true) = true
  ),
  team_tree AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.director_id = v_root

    UNION ALL

    SELECT child.id
    FROM public.profiles child
    JOIN team_tree parent ON child.director_id = parent.id
  ),
  members AS (
    SELECT v_root AS id
    UNION
    SELECT id FROM unit_members
    UNION
    SELECT id FROM contract_members
    UNION
    SELECT id FROM team_tree
  ),
  role_priority AS (
    SELECT DISTINCT ON (ur.user_id)
      ur.user_id,
      ur.role::text AS role_name
    FROM public.user_roles ur
    WHERE ur.user_id IN (SELECT id FROM members)
    ORDER BY ur.user_id,
      CASE ur.role::text
        WHEN 'owner' THEN 1
        WHEN 'administrator' THEN 2
        WHEN 'admin' THEN 3
        WHEN 'security_admin' THEN 4
        WHEN 'ops_admin' THEN 5
        WHEN 'content_admin' THEN 6
        WHEN 'finance_admin' THEN 7
        WHEN 'support_admin' THEN 8
        WHEN 'community_member' THEN 9
        WHEN 'member' THEN 10
        ELSE 99
      END
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
    m.id AS user_id,
    p.full_name,
    p.email,
    COALESCE(uls.current_level, p.current_phase, 0)::integer AS level,
    COALESCE(uls.current_role_label, rp.role_name, p.business_stage, 'Member')::text AS role_label,
    COALESCE(p.business_stage, rp.role_name, uls.current_role_label, 'Member')::text AS member_role,
    COALESCE(wa.cnt, 0)::bigint AS appts_this_week,
    CASE
      WHEN COALESCE(otp.bookings, 0) > 0
        THEN ROUND((COALESCE(otp.shows, 0)::numeric / NULLIF(otp.bookings, 0)::numeric) * 100, 1)
      ELSE 0::numeric
    END AS show_rate,
    COALESCE(otp.close_rate, 0)::numeric AS close_rate,
    COALESCE(otp.bookings, 0)::numeric AS bookings_total,
    COALESCE(otp.shows, 0)::numeric AS shows_total,
    COALESCE(otp.deals, 0)::numeric AS deals_total,
    (m.id = v_caller) AS is_self
  FROM members m
  JOIN public.profiles p ON p.id = m.id
  LEFT JOIN public.user_level_status uls ON uls.user_id = m.id
  LEFT JOIN role_priority rp ON rp.user_id = m.id
  LEFT JOIN public.operator_team_performance otp
    ON otp.traffic_owner = m.id
   AND otp.operator_id = v_root
  LEFT JOIN week_appts wa ON wa.setter_id = m.id
  ORDER BY
    (m.id = v_caller) DESC,
    COALESCE(otp.close_rate, 0) DESC,
    COALESCE(uls.current_level, p.current_phase, 0) DESC,
    COALESCE(p.full_name, p.email) NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_operator_team(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_today_overview(_director uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false)
                     OR COALESCE(public.has_role(auth.uid(), 'owner'::public.app_role), false);
  v_total bigint := 0;
  v_team_size int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_root IS NULL THEN
    RAISE EXCEPTION 'director required';
  END IF;

  IF NOT v_is_admin THEN
    IF v_root <> v_caller THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  WITH RECURSIVE
  unit_members AS (
    SELECT DISTINCT otm.member_id AS id
    FROM public.operator_team_members otm
    JOIN public.operator_units ou
      ON ou.id = otm.unit_id
     AND ou.status = 'active'
    WHERE otm.active = true
      AND (
        ou.operator_id = v_root
        OR otm.unit_id IN (
          SELECT otm2.unit_id
          FROM public.operator_team_members otm2
          WHERE otm2.member_id = v_root
            AND otm2.active = true
            AND otm2.team_role = 'operator'
        )
      )
  ),
  contract_members AS (
    SELECT DISTINCT tmc.team_member_id AS id
    FROM public.team_membership_contract tmc
    WHERE tmc.operator_id = v_root
      AND COALESCE(tmc.active, true) = true
  ),
  team_tree AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.director_id = v_root

    UNION ALL

    SELECT child.id
    FROM public.profiles child
    JOIN team_tree parent ON child.director_id = parent.id
  ),
  members AS (
    SELECT v_root AS id
    UNION
    SELECT id FROM unit_members
    UNION
    SELECT id FROM contract_members
    UNION
    SELECT id FROM team_tree
  )
  SELECT COUNT(*) INTO v_team_size FROM members;

  WITH RECURSIVE
  unit_members AS (
    SELECT DISTINCT otm.member_id AS id
    FROM public.operator_team_members otm
    JOIN public.operator_units ou
      ON ou.id = otm.unit_id
     AND ou.status = 'active'
    WHERE otm.active = true
      AND (
        ou.operator_id = v_root
        OR otm.unit_id IN (
          SELECT otm2.unit_id
          FROM public.operator_team_members otm2
          WHERE otm2.member_id = v_root
            AND otm2.active = true
            AND otm2.team_role = 'operator'
        )
      )
  ),
  contract_members AS (
    SELECT DISTINCT tmc.team_member_id AS id
    FROM public.team_membership_contract tmc
    WHERE tmc.operator_id = v_root
      AND COALESCE(tmc.active, true) = true
  ),
  team_tree AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.director_id = v_root

    UNION ALL

    SELECT child.id
    FROM public.profiles child
    JOIN team_tree parent ON child.director_id = parent.id
  ),
  members AS (
    SELECT v_root AS id
    UNION
    SELECT id FROM unit_members
    UNION
    SELECT id FROM contract_members
    UNION
    SELECT id FROM team_tree
  )
  SELECT COUNT(*) INTO v_total
  FROM public.appointments a
  WHERE a.setter_id IN (SELECT id FROM members)
    AND a.starts_at >= date_trunc('day', now())
    AND a.starts_at < date_trunc('day', now()) + interval '1 day';

  RETURN jsonb_build_object('team_size', v_team_size, 'appts_today', v_total);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_today_overview(uuid) TO authenticated;