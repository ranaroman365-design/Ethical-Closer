-- ============================================================
-- Operator Calendar Oversight — read-only RPCs (security definer)
-- ============================================================

-- Helper: is the caller at least L6?
CREATE OR REPLACE FUNCTION public.is_operator_l6plus(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT current_level >= 6 FROM public.user_level_status WHERE user_id = _user),
    false
  )
$$;

-- Helper: is the target a member of caller's team?
CREATE OR REPLACE FUNCTION public.is_team_member_of(_member uuid, _director uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _member AND director_id = _director
  )
$$;

-- ============================================================
-- 1) Team list with perf snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL)
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
  deals_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_director uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Permission: must be admin OR (L6+ AND querying own team)
  IF NOT v_is_admin THEN
    IF v_director <> v_caller THEN
      RAISE EXCEPTION 'forbidden: cannot query other director teams';
    END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  RETURN QUERY
  WITH team AS (
    SELECT p.id, p.full_name, p.email, p.business_stage
    FROM public.profiles p
    WHERE p.director_id = v_director
  ),
  week_appts AS (
    SELECT a.setter_id, COUNT(*)::bigint AS cnt
    FROM public.appointments a
    WHERE a.setter_id IN (SELECT id FROM team)
      AND a.starts_at >= date_trunc('week', now())
      AND a.starts_at <  date_trunc('week', now()) + interval '7 days'
    GROUP BY a.setter_id
  )
  SELECT
    t.id                                              AS user_id,
    t.full_name                                       AS full_name,
    t.email                                           AS email,
    uls.current_level                                 AS level,
    uls.current_role_label                            AS role_label,
    t.business_stage                                  AS member_role,
    COALESCE(wa.cnt, 0)                               AS appts_this_week,
    otp.close_rate                                    AS show_rate,  -- aliased below
    otp.close_rate                                    AS close_rate,
    otp.bookings                                      AS bookings_total,
    otp.shows                                         AS shows_total,
    otp.deals                                         AS deals_total
  FROM team t
  LEFT JOIN public.user_level_status uls ON uls.user_id = t.id
  LEFT JOIN public.operator_team_performance otp ON otp.traffic_owner = t.id
  LEFT JOIN week_appts wa ON wa.setter_id = t.id
  ORDER BY uls.current_level DESC NULLS LAST, t.full_name NULLS LAST;
END;
$$;

-- Note: operator_team_performance does not expose show_rate as a separate column
-- (only close_rate). We surface close_rate; UI labels it accordingly.

-- ============================================================
-- 2) Calendar for a single team member (appointments + slots)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_team_member_calendar(
  _member uuid,
  _from timestamptz,
  _to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_appts jsonb;
  v_slots jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _member IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'member, from, to required';
  END IF;
  IF _to <= _from OR _to > _from + interval '60 days' THEN
    RAISE EXCEPTION 'invalid range (max 60 days)';
  END IF;

  -- Permission: admin OR (caller is L6+ AND member is in caller's team) OR caller is the member
  IF NOT v_is_admin THEN
    IF v_caller <> _member THEN
      IF NOT public.is_operator_l6plus(v_caller) THEN
        RAISE EXCEPTION 'forbidden: requires Level 6+';
      END IF;
      IF NOT public.is_team_member_of(_member, v_caller) THEN
        RAISE EXCEPTION 'forbidden: target user not in your team';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'call_type', a.call_type,
    'appointment_status', a.appointment_status,
    'call_status', a.call_status,
    'outcome', a.outcome,
    'pricing_tier', a.pricing_tier,
    'attendance_flag', a.attendance_flag,
    'lead_id', a.lead_id
  ) ORDER BY a.starts_at), '[]'::jsonb)
  INTO v_appts
  FROM public.appointments a
  WHERE a.setter_id = _member
    AND a.starts_at >= _from
    AND a.starts_at <  _to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', s.date,
    'max_bookings', s.max_bookings,
    'current_bookings', s.current_bookings,
    'is_active', s.is_active
  ) ORDER BY s.date), '[]'::jsonb)
  INTO v_slots
  FROM public.availability_slots s
  WHERE s.date >= _from::date
    AND s.date <  _to::date;

  RETURN jsonb_build_object(
    'appointments', v_appts,
    'slots',        v_slots,
    'member_id',    _member,
    'from',         _from,
    'to',           _to
  );
END;
$$;

-- ============================================================
-- Optional helper: today's team booking count
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_team_today_overview(_director uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_director uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_total bigint;
  v_team_size int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF NOT v_is_admin THEN
    IF v_director <> v_caller THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.appointments a
  WHERE a.setter_id IN (SELECT id FROM public.profiles WHERE director_id = v_director)
    AND a.starts_at >= date_trunc('day', now())
    AND a.starts_at <  date_trunc('day', now()) + interval '1 day';

  SELECT COUNT(*) INTO v_team_size
  FROM public.profiles WHERE director_id = v_director;

  RETURN jsonb_build_object(
    'team_size', v_team_size,
    'appts_today', v_total
  );
END;
$$;

-- Grants — these RPCs are the intended access path
GRANT EXECUTE ON FUNCTION public.get_operator_team(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_member_calendar(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_today_overview(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_operator_l6plus(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member_of(uuid, uuid)       TO authenticated;