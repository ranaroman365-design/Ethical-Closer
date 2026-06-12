
-- 1. Fix is_eligible_director to allow L6+ (Operators manage teams)
CREATE OR REPLACE FUNCTION public.is_eligible_director(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id)
    AND (
      COALESCE(
        (SELECT current_level >= 6 FROM public.user_level_status WHERE user_id = _user_id LIMIT 1),
        false
      )
      OR public.has_role(_user_id, 'owner'::app_role)
      OR public.has_role(_user_id, 'partner_admin'::app_role)
    );
$$;

-- 2. Drop and recreate enriched operator_team_performance view
DROP VIEW IF EXISTS public.operator_team_performance CASCADE;

CREATE VIEW public.operator_team_performance WITH (security_invoker=on) AS
SELECT
  p.id AS traffic_owner,
  p.full_name,
  p.email,
  COALESCE(uls.current_role_label, '') AS role_label,
  COALESCE(uls.current_level, 0) AS level,
  p.business_stage,
  COALESCE(p.is_active, true) AS is_active,
  p.director_id AS manager_id,
  p.created_at,
  p.id AS member_id,
  p.id AS user_id,
  p.id AS team_member_id,
  p.director_id AS operator_id,
  p.full_name AS name,
  COALESCE(uls.current_role_label, '') AS team_role,
  COALESCE(p.is_active, true) AS active,
  '' AS role,
  COALESCE(bc.bookings, 0)::numeric AS bookings,
  COALESCE(bc.bookings, 0)::numeric AS appointment_count,
  COALESCE(bc.bookings, 0)::numeric AS booked_count,
  COALESCE(sc.shows, 0)::numeric AS shows,
  COALESCE(sc.shows, 0)::numeric AS showed_count,
  COALESCE(cc.confirmed, 0)::numeric AS confirmed_count,
  COALESCE(nc.no_shows, 0)::numeric AS no_shows,
  COALESCE(nc.no_shows, 0)::numeric AS no_show_count,
  COALESCE(dc.deals, 0)::numeric AS deals,
  COALESCE(dc.deals, 0)::numeric AS closed_won_count,
  CASE WHEN COALESCE(sc.shows, 0) = 0 THEN 0::numeric
       ELSE round((COALESCE(dc.deals, 0)::numeric / sc.shows::numeric) * 100, 1)
  END AS close_rate,
  COALESCE(ls.cnt, 0)::numeric AS started_count,
  COALESCE(rv.total, 0)::numeric AS revenue_total,
  COALESCE(cm.total, 0)::numeric AS commission_total,
  GREATEST(bc.last_t, rv.last_t, cm.last_t, ls.last_t) AS last_activity_at
FROM public.profiles p
LEFT JOIN public.user_level_status uls ON uls.user_id = p.id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS bookings, MAX(a.starts_at) AS last_t
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= (now() - interval '30 days')
) bc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS shows
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= (now() - interval '30 days') AND a.attendance_flag = true
) sc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS confirmed
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= (now() - interval '30 days') AND a.appointment_status = 'confirmed'
) cc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS no_shows
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= (now() - interval '30 days') AND a.attendance_flag = false
) nc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS deals
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= (now() - interval '30 days') AND a.outcome = 'won'
) dc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS cnt, MAX(l.created_at) AS last_t
  FROM public.leads l
  WHERE (l.setter_id = p.id OR l.closer_id = p.id OR l.assigned_operator_id = p.id)
    AND l.created_at >= (now() - interval '30 days') AND l.stage = 'started'
) ls ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(c.revenue), 0)::numeric AS total, MAX(c.created_at) AS last_t
  FROM public.calls c
  WHERE c.user_id = p.id AND c.created_at >= (now() - interval '30 days')
    AND COALESCE(c.is_simulation, false) = false AND c.revenue > 0
) rv ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(cm2.amount), 0)::numeric AS total, MAX(cm2.created_at) AS last_t
  FROM public.commissions cm2
  WHERE cm2.user_id = p.id AND cm2.created_at >= (now() - interval '30 days')
    AND cm2.payout_status NOT IN ('cancelled', 'reversed')
) cm ON true;

GRANT SELECT ON public.operator_team_performance TO authenticated;
GRANT SELECT ON public.operator_team_performance TO anon;

-- 3. Recreate get_operator_team RPC
CREATE OR REPLACE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, full_name text, email text, level integer, role_label text,
  member_role text, appts_this_week bigint, show_rate numeric, close_rate numeric,
  bookings_total numeric, shows_total numeric, deals_total numeric, is_self boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
    SELECT * FROM sub UNION SELECT * FROM fallback
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
    m.id, m.full_name, m.email,
    uls.current_level, uls.current_role_label, m.business_stage,
    COALESCE(wa.cnt, 0),
    otp.close_rate, otp.close_rate,
    otp.bookings, otp.shows, otp.deals,
    (m.id = v_caller)
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

-- 4. Link Anna + Tom under Daniel L6
UPDATE public.profiles
SET director_id = '04e91d76-de42-414d-a41f-3fe28d9df085'
WHERE id IN (
  '81beb75b-371e-458e-9286-af519049dfd6',
  '835f9e2e-cff1-48a8-9c8c-eda714cd1001'
)
AND (director_id IS NULL OR director_id != '04e91d76-de42-414d-a41f-3fe28d9df085');
