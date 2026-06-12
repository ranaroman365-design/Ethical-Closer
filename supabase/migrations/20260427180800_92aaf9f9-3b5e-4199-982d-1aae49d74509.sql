-- Recursive subtree membership: is `_member` anywhere under `_root`?
CREATE OR REPLACE FUNCTION public.is_in_team_subtree(_member uuid, _root uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE sub AS (
    SELECT id FROM public.profiles WHERE director_id = _root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM sub WHERE id = _member)
$$;
GRANT EXECUTE ON FUNCTION public.is_in_team_subtree(uuid, uuid) TO authenticated;

-- Drop the old signature so we can change the return shape
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
  WITH RECURSIVE sub AS (
    SELECT p.id, p.full_name, p.email, p.business_stage
    FROM public.profiles p WHERE p.id = v_root
    UNION ALL
    SELECT p.id, p.full_name, p.email, p.business_stage
    FROM public.profiles p JOIN sub s ON p.director_id = s.id
  ),
  week_appts AS (
    SELECT a.setter_id, COUNT(*)::bigint AS cnt
    FROM public.appointments a
    WHERE a.setter_id IN (SELECT id FROM sub)
      AND a.starts_at >= date_trunc('week', now())
      AND a.starts_at <  date_trunc('week', now()) + interval '7 days'
    GROUP BY a.setter_id
  )
  SELECT
    s.id, s.full_name, s.email,
    uls.current_level, uls.current_role_label, s.business_stage,
    COALESCE(wa.cnt, 0),
    otp.close_rate, otp.close_rate,
    otp.bookings, otp.shows, otp.deals,
    (s.id = v_caller) AS is_self
  FROM sub s
  LEFT JOIN public.user_level_status uls ON uls.user_id = s.id
  LEFT JOIN public.operator_team_performance otp ON otp.traffic_owner = s.id
  LEFT JOIN week_appts wa ON wa.setter_id = s.id
  ORDER BY
    (s.id = v_caller) DESC,                -- caller always first
    otp.close_rate DESC NULLS LAST,        -- performance score desc
    uls.current_level DESC NULLS LAST,
    s.full_name NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_operator_team(uuid) TO authenticated;

-- get_team_member_calendar: subtree-based permission
CREATE OR REPLACE FUNCTION public.get_team_member_calendar(
  _member uuid, _from timestamptz, _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
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

  IF NOT v_is_admin THEN
    IF v_caller <> _member THEN
      IF NOT public.is_operator_l6plus(v_caller) THEN
        RAISE EXCEPTION 'forbidden: requires Level 6+';
      END IF;
      IF NOT public.is_in_team_subtree(_member, v_caller) THEN
        RAISE EXCEPTION 'forbidden: target user not in your team';
      END IF;
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

-- get_team_today_overview: subtree
CREATE OR REPLACE FUNCTION public.get_team_today_overview(_director uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  WITH RECURSIVE sub AS (
    SELECT id FROM public.profiles WHERE director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  )
  SELECT COUNT(*) INTO v_total
  FROM public.appointments a
  WHERE a.setter_id IN (SELECT id FROM sub)
    AND a.starts_at >= date_trunc('day', now())
    AND a.starts_at <  date_trunc('day', now()) + interval '1 day';

  WITH RECURSIVE sub AS (
    SELECT id FROM public.profiles WHERE director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  )
  SELECT COUNT(*) INTO v_team_size FROM sub;

  RETURN jsonb_build_object('team_size', v_team_size, 'appts_today', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_today_overview(uuid) TO authenticated;