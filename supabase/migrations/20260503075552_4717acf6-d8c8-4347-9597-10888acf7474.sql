
-- 1. Add is_simulation_user column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_simulation_user boolean NOT NULL DEFAULT false;

-- 2. Mark Oleg Simulation
UPDATE public.profiles SET is_simulation_user = true, is_test_user = true
WHERE id = 'a5c3e973-a66a-4582-80fd-6b4e43e8ad64';

-- 3. Fix get_team_member_ids: when caller is_test_user, include test team members too
-- Also: L7+ and admin see ALL active users (not just hierarchy)
CREATE OR REPLACE FUNCTION public.get_team_member_ids(p_user_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, member_level integer, member_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_level int;
  v_director_id uuid;
  v_is_admin boolean;
  v_is_test boolean;
BEGIN
  SELECT p.current_phase, p.director_id, COALESCE(p.is_test_user, false)
  INTO v_level, v_director_id, v_is_test
  FROM profiles p WHERE p.id = p_user_id;

  IF v_level IS NULL THEN RETURN; END IF;

  v_is_admin := COALESCE(public.has_role(p_user_id, 'admin'), false)
             OR COALESCE(public.has_role(p_user_id, 'owner'), false)
             OR COALESCE(public.has_role(p_user_id, 'administrator'), false);

  -- Admin or L8+: everyone (excluding simulation unless debug)
  IF v_is_admin OR v_level >= 8 THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.current_phase,
        CASE p.current_phase
          WHEN 1 THEN 'Opener' WHEN 2 THEN 'Setter' WHEN 3 THEN 'Setter'
          WHEN 4 THEN 'Junior Closer' WHEN 5 THEN 'Managing Closer'
          WHEN 6 THEN 'Senior Closer' WHEN 7 THEN 'Director' WHEN 8 THEN 'Partner'
          ELSE 'Unknown'
        END
      FROM profiles p
      WHERE p.id <> p_user_id
        AND p.is_active = true
        AND COALESCE(p.is_simulation_user, false) = false;
    RETURN;
  END IF;

  -- L7 Director: all in hierarchy tree
  IF v_level >= 7 THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.current_phase,
        CASE p.current_phase
          WHEN 1 THEN 'Opener' WHEN 2 THEN 'Setter' WHEN 3 THEN 'Setter'
          WHEN 4 THEN 'Junior Closer' WHEN 5 THEN 'Managing Closer'
          WHEN 6 THEN 'Senior Closer' WHEN 7 THEN 'Director' WHEN 8 THEN 'Partner'
          ELSE 'Unknown'
        END
      FROM profiles p
      WHERE (p.director_id = p_user_id
         OR p.director_id IN (SELECT pp.id FROM profiles pp WHERE pp.director_id = p_user_id AND pp.current_phase >= 6))
        AND p.is_active = true
        AND COALESCE(p.is_simulation_user, false) = false
        AND (v_is_test OR COALESCE(p.is_test_user, false) = false)
      ORDER BY p.current_phase DESC, p.full_name;
    RETURN;
  END IF;

  -- L4-L6: operator unit + director hierarchy
  -- Key fix: when caller is test user, allow seeing test team members
  IF v_level >= 4 THEN
    RETURN QUERY
      SELECT DISTINCT ON (p.id) p.id, p.full_name, p.current_phase,
        COALESCE(otm.team_role,
          CASE p.current_phase
            WHEN 1 THEN 'Opener' WHEN 2 THEN 'Setter' WHEN 3 THEN 'Setter'
            WHEN 4 THEN 'Junior Closer' WHEN 5 THEN 'Managing Closer'
            WHEN 6 THEN 'Senior Closer' WHEN 7 THEN 'Director' WHEN 8 THEN 'Partner'
            ELSE 'Unknown'
          END
        )
      FROM profiles p
      LEFT JOIN operator_team_members otm ON otm.member_id = p.id AND otm.active = true
      LEFT JOIN operator_units ou ON ou.id = otm.unit_id
      WHERE p.id <> p_user_id
        AND p.is_active = true
        AND COALESCE(p.is_simulation_user, false) = false
        AND (v_is_test OR COALESCE(p.is_test_user, false) = false)
        AND (
          ou.operator_id = p_user_id
          OR (v_director_id IS NOT NULL AND p.director_id = v_director_id AND p.current_phase <= v_level)
          OR p.director_id = p_user_id
        )
      ORDER BY p.id, p.current_phase DESC, p.full_name;
    RETURN;
  END IF;
END;
$function$;

-- 4. Fix lead_in_viewer_unit: also check if lead's setter/closer is in viewer's team subtree
CREATE OR REPLACE FUNCTION public.lead_in_viewer_unit(_lead_id uuid, _viewer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Original: lead unit matches viewer's unit membership
    SELECT 1 FROM public.leads l
    JOIN public.operator_team_members otm ON otm.unit_id = l.unit_id
    WHERE l.id = _lead_id AND otm.member_id = _viewer_id AND otm.active = true
  )
  OR EXISTS (
    -- L6 operator: lead's setter or closer is in their operator unit
    SELECT 1 FROM public.leads l
    JOIN public.operator_team_members otm ON (otm.member_id = l.setter_id OR otm.member_id = l.closer_id)
    JOIN public.operator_units ou ON ou.id = otm.unit_id
    WHERE l.id = _lead_id AND otm.active = true AND ou.operator_id = _viewer_id
  )
  OR EXISTS (
    -- L6 director hierarchy: lead's setter/closer has director_id = viewer
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON (p.id = l.setter_id OR p.id = l.closer_id)
    WHERE l.id = _lead_id AND p.director_id = _viewer_id
  )
$function$;

-- 5. Update get_operator_team to exclude simulation users by default
-- (It already doesn't filter test users, which is correct for calendar viewing)
-- Just add is_simulation_user filter
CREATE OR REPLACE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, full_name text, email text, level integer, role_label text, member_role text, appts_this_week bigint, show_rate numeric, close_rate numeric, bookings_total numeric, shows_total numeric, deals_total numeric, is_self boolean)
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
  WHERE COALESCE(p.is_simulation_user, false) = false
  ORDER BY
    (m.id = v_caller) DESC,
    COALESCE(otp.close_rate, 0) DESC,
    COALESCE(uls.current_level, p.current_phase, 0) DESC,
    COALESCE(p.full_name, p.email) NULLS LAST;
END;
$function$;

-- 6. Add L6+ leads SELECT via team subtree (covers cases where unit_id is null on leads)
DROP POLICY IF EXISTS "L6 see team subtree leads" ON public.leads;
CREATE POLICY "L6 see team subtree leads" ON public.leads
FOR SELECT TO authenticated
USING (
  is_operator_l6plus(auth.uid()) AND (
    is_in_team_subtree(setter_id, auth.uid())
    OR is_in_team_subtree(closer_id, auth.uid())
    OR setter_id = auth.uid()
    OR closer_id = auth.uid()
  )
);

-- 7. Ensure leads owned by Daniel's team have correct unit_id
UPDATE public.leads 
SET unit_id = 'a1000000-0000-0000-0000-000000000002'
WHERE unit_id IS NULL 
  AND (setter_id IN ('366e7808-35c7-4329-bd36-323f0f58361e','53df5aed-eab8-463a-9cee-0ba6ffa17d4b','e37a93c6-46d7-4aa3-a581-73bfbe299ce3','15c91e19-1659-4832-9c43-52fa1ae8b91e')
    OR closer_id IN ('366e7808-35c7-4329-bd36-323f0f58361e','15c91e19-1659-4832-9c43-52fa1ae8b91e'));
