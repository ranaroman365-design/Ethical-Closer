
-- 1. Drop the existing regular view
DROP VIEW IF EXISTS public.operator_team_performance;

-- 2. Create as MATERIALIZED VIEW (same definition)
CREATE MATERIALIZED VIEW public.operator_team_performance AS
SELECT p.id AS traffic_owner,
    p.full_name,
    p.email,
    COALESCE(uls.current_role_label, ''::text) AS role_label,
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
    COALESCE(uls.current_role_label, ''::text) AS team_role,
    COALESCE(p.is_active, true) AS active,
    ''::text AS role,
    COALESCE(bc.bookings, 0::numeric) AS bookings,
    COALESCE(bc.bookings, 0::numeric) AS appointment_count,
    COALESCE(bc.bookings, 0::numeric) AS booked_count,
    COALESCE(sc.shows, 0::numeric) AS shows,
    COALESCE(sc.shows, 0::numeric) AS showed_count,
    COALESCE(cc.confirmed, 0::numeric) AS confirmed_count,
    COALESCE(nc.no_shows, 0::numeric) AS no_shows,
    COALESCE(nc.no_shows, 0::numeric) AS no_show_count,
    COALESCE(dc.deals, 0::numeric) AS deals,
    COALESCE(dc.deals, 0::numeric) AS closed_won_count,
    CASE
        WHEN COALESCE(sc.shows, 0::numeric) = 0::numeric THEN 0::numeric
        ELSE round(COALESCE(dc.deals, 0::numeric) / sc.shows * 100::numeric, 1)
    END AS close_rate,
    COALESCE(ls.cnt, 0::numeric) AS started_count,
    COALESCE(rv.total, 0::numeric) AS revenue_total,
    COALESCE(cm.total, 0::numeric) AS commission_total,
    GREATEST(bc.last_t, rv.last_t, cm.last_t, ls.last_t) AS last_activity_at
FROM profiles p
LEFT JOIN user_level_status uls ON uls.user_id = p.id
LEFT JOIN LATERAL (
    SELECT count(*)::numeric AS bookings, max(a.starts_at) AS last_t
    FROM appointments a
    WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
      AND a.starts_at >= (now() - '30 days'::interval)
) bc ON true
LEFT JOIN LATERAL (
    SELECT count(*)::numeric AS shows
    FROM appointments a
    WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
      AND a.starts_at >= (now() - '30 days'::interval) AND a.attendance_flag = true
) sc ON true
LEFT JOIN LATERAL (
    SELECT count(*)::numeric AS confirmed
    FROM appointments a
    WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
      AND a.starts_at >= (now() - '30 days'::interval) AND a.appointment_status = 'confirmed'
) cc ON true
LEFT JOIN LATERAL (
    SELECT count(*)::numeric AS no_shows
    FROM appointments a
    WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
      AND a.starts_at >= (now() - '30 days'::interval) AND a.attendance_flag = false
) nc ON true
LEFT JOIN LATERAL (
    SELECT count(*)::numeric AS deals
    FROM appointments a
    WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
      AND a.starts_at >= (now() - '30 days'::interval) AND a.outcome = 'won'
) dc ON true
LEFT JOIN LATERAL (
    SELECT count(*)::numeric AS cnt, max(l.created_at) AS last_t
    FROM leads l
    WHERE (l.setter_id = p.id OR l.closer_id = p.id OR l.assigned_operator_id = p.id)
      AND l.created_at >= (now() - '30 days'::interval) AND l.stage = 'started'
) ls ON true
LEFT JOIN LATERAL (
    SELECT COALESCE(sum(c.revenue), 0::numeric) AS total, max(c.created_at) AS last_t
    FROM calls c
    WHERE c.user_id = p.id AND c.created_at >= (now() - '30 days'::interval)
      AND COALESCE(c.is_simulation, false) = false AND c.revenue > 0
) rv ON true
LEFT JOIN LATERAL (
    SELECT COALESCE(sum(cm2.amount), 0::numeric) AS total, max(cm2.created_at) AS last_t
    FROM commissions cm2
    WHERE cm2.user_id = p.id AND cm2.created_at >= (now() - '30 days'::interval)
      AND cm2.payout_status NOT IN ('cancelled', 'reversed')
) cm ON true
WITH DATA;

-- 3. Unique index for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_otp_mat_traffic_owner ON public.operator_team_performance (traffic_owner);

-- 4. Additional lookup index used by get_operator_team JOIN
CREATE INDEX idx_otp_mat_close_rate ON public.operator_team_performance (close_rate DESC NULLS LAST);

-- 5. Refresh function (SECURITY DEFINER so any authenticated user triggers it without direct table grants)
CREATE OR REPLACE FUNCTION public.refresh_team_performance_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.operator_team_performance;
END;
$$;

-- 6. Grant execute to authenticated users (the RPC will be called client-side after writes)
GRANT EXECUTE ON FUNCTION public.refresh_team_performance_cache() TO authenticated;
