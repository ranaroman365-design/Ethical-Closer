-- Helper: same workspace check (product_key based, single tenant today)
CREATE OR REPLACE FUNCTION public.same_workspace(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pa
    JOIN public.profiles pb ON pb.id = _b
    WHERE pa.id = _a
      AND COALESCE(pa.product_key, 'etc') = COALESCE(pb.product_key, 'etc')
  )
$$;
GRANT EXECUTE ON FUNCTION public.same_workspace(uuid, uuid) TO authenticated;

-- Replace get_operator_team with subtree-first + workspace fallback
DROP FUNCTION IF EXISTS public.get_operator_team(uuid);

CREATE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL)
RETURNS TABLE (
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_caller_pk text;
  v_subtree_count int;
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

  SELECT COALESCE(p.product_key, 'etc') INTO v_caller_pk
  FROM public.profiles p WHERE p.id = v_root;

  -- Count explicit subtree members (excluding root itself)
  WITH RECURSIVE sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  )
  SELECT COUNT(*) INTO v_subtree_count FROM sub;

  RETURN QUERY
  WITH RECURSIVE sub AS (
    SELECT p.id, p.full_name, p.email, p.business_stage
    FROM public.profiles p WHERE p.id = v_root
    UNION ALL
    SELECT p.id, p.full_name, p.email, p.business_stage
    FROM public.profiles p JOIN sub s ON p.director_id = s.id
  ),
  -- Workspace fallback set: only used when explicit subtree is empty.
  -- Includes operational sales levels L2..L5 in the same workspace.
  fallback AS (
    SELECT p.id, p.full_name, p.email, p.business_stage
    FROM public.profiles p
    JOIN public.user_level_status uls2 ON uls2.user_id = p.id
    WHERE v_subtree_count = 0
      AND COALESCE(p.product_key, 'etc') = v_caller_pk
      AND p.id <> v_root
      AND uls2.current_level BETWEEN 2 AND 5
  ),
  members AS (
    SELECT * FROM sub
    UNION
    SELECT * FROM fallback
  ),
  week_appts AS (
    SELECT a.setter_id, COUNT(*)::bigint AS cnt
    FROM public.appointments a
    WHERE a.setter_id IN (SELECT id FROM members)
      AND a.starts_at >= date_trunc('week', now())
      AND a.starts_at <  date_trunc('week', now()) + interval '7 days'
    GROUP BY a.setter_id
  )
  SELECT
    m.id, m.full_name, m.email,
    uls.current_level, uls.current_role_label, m.business_stage,
    COALESCE(wa.cnt, 0),
    otp.close_rate, otp.close_rate,
    otp.bookings, otp.shows, otp.deals,
    (m.id = v_caller) AS is_self
  FROM members m
  LEFT JOIN public.user_level_status uls ON uls.user_id = m.id
  LEFT JOIN public.operator_team_performance otp ON otp.traffic_owner = m.id
  LEFT JOIN week_appts wa ON wa.setter_id = m.id
  ORDER BY
    (m.id = v_caller) DESC,
    otp.close_rate DESC NULLS LAST,
    uls.current_level DESC NULLS LAST,
    COALESCE(m.full_name, m.email) NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_operator_team(uuid) TO authenticated;

-- Update get_team_member_calendar permission: also allow same-workspace
-- lower-level access when no explicit hierarchy exists.
CREATE OR REPLACE FUNCTION public.get_team_member_calendar(
  _member uuid, _from timestamptz, _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_caller_level int;
  v_member_level int;
  v_appts jsonb;
  v_slots jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _member IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'member, from, to required';
  END IF;
  IF _to <= _from OR _to > _from + interval '60 days' THEN
    RAISE EXCEPTION 'invalid range (max 60 days)';
  END IF;

  IF NOT v_is_admin AND v_caller <> _member THEN
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;

    SELECT current_level INTO v_caller_level FROM public.user_level_status WHERE user_id = v_caller;
    SELECT current_level INTO v_member_level FROM public.user_level_status WHERE user_id = _member;

    -- Allow if explicit subtree OR (same workspace AND target is strictly lower level)
    IF NOT (
      public.is_in_team_subtree(_member, v_caller)
      OR (
        public.same_workspace(v_caller, _member)
        AND COALESCE(v_member_level, 99) < COALESCE(v_caller_level, 0)
      )
    ) THEN
      RAISE EXCEPTION 'forbidden: target user not in your team';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'call_type', a.call_type, 'appointment_status', a.appointment_status,
    'call_status', a.call_status, 'outcome', a.outcome,
    'pricing_tier', a.pricing_tier, 'attendance_flag', a.attendance_flag,
    'lead_id', a.lead_id
  ) ORDER BY a.starts_at), '[]'::jsonb)
  INTO v_appts
  FROM public.appointments a
  WHERE a.setter_id = _member
    AND a.starts_at >= _from AND a.starts_at < _to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', s.date, 'max_bookings', s.max_bookings,
    'current_bookings', s.current_bookings, 'is_active', s.is_active
  ) ORDER BY s.date), '[]'::jsonb)
  INTO v_slots
  FROM public.availability_slots s
  WHERE s.date >= _from::date AND s.date < _to::date;

  RETURN jsonb_build_object(
    'appointments', v_appts, 'slots', v_slots,
    'member_id', _member, 'from', _from, 'to', _to
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_member_calendar(uuid, timestamptz, timestamptz) TO authenticated;

-- get_team_today_overview: include workspace fallback in count
CREATE OR REPLACE FUNCTION public.get_team_today_overview(_director uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_caller_pk text;
  v_subtree_count int;
  v_total bigint;
  v_team_size int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT v_is_admin THEN
    IF v_root <> v_caller THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  SELECT COALESCE(p.product_key, 'etc') INTO v_caller_pk
  FROM public.profiles p WHERE p.id = v_root;

  WITH RECURSIVE sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  )
  SELECT COUNT(*) INTO v_subtree_count FROM sub;

  WITH RECURSIVE sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  ),
  fallback AS (
    SELECT p.id FROM public.profiles p
    JOIN public.user_level_status uls ON uls.user_id = p.id
    WHERE v_subtree_count = 0
      AND COALESCE(p.product_key, 'etc') = v_caller_pk
      AND p.id <> v_root
      AND uls.current_level BETWEEN 2 AND 5
  ),
  members AS (
    SELECT id FROM sub UNION SELECT id FROM fallback UNION SELECT v_root
  )
  SELECT COUNT(*) INTO v_total
  FROM public.appointments a
  WHERE a.setter_id IN (SELECT id FROM members)
    AND a.starts_at >= date_trunc('day', now())
    AND a.starts_at <  date_trunc('day', now()) + interval '1 day';

  WITH RECURSIVE sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  ),
  fallback AS (
    SELECT p.id FROM public.profiles p
    JOIN public.user_level_status uls ON uls.user_id = p.id
    WHERE v_subtree_count = 0
      AND COALESCE(p.product_key, 'etc') = v_caller_pk
      AND p.id <> v_root
      AND uls.current_level BETWEEN 2 AND 5
  ),
  members AS (
    SELECT id FROM sub UNION SELECT id FROM fallback UNION SELECT v_root
  )
  SELECT COUNT(*) INTO v_team_size FROM members;

  RETURN jsonb_build_object('team_size', v_team_size, 'appts_today', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_today_overview(uuid) TO authenticated;