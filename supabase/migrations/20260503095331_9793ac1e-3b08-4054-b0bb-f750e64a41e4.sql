
CREATE OR REPLACE FUNCTION public.get_assignable_operators_with_stats(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  current_phase int,
  shows_30d bigint,
  closes_30d bigint,
  revenue_30d numeric,
  completion_rate numeric,
  appts_this_week bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT DISTINCT p.id, p.full_name, p.email, p.current_phase
    FROM profiles p
    JOIN (SELECT current_phase FROM profiles WHERE id = p_user_id) ci ON true
    WHERE p.member_status IS DISTINCT FROM 'inactive'
      AND (
        p.id = p_user_id
        OR (ci.current_phase >= 8 AND p.current_phase >= 1)
        OR (ci.current_phase = 7 AND EXISTS (
          SELECT 1 FROM operator_team_members otm2
          JOIN operator_units ou2 ON ou2.id = otm2.unit_id
          WHERE otm2.member_id = p.id AND otm2.active = true
            AND (ou2.operator_id = p_user_id OR EXISTS (
              SELECT 1 FROM operator_team_members otm3
              WHERE otm3.unit_id = ou2.id AND otm3.member_id = p_user_id AND otm3.active = true
            ))
        ))
        OR (ci.current_phase >= 4 AND ci.current_phase <= 6 AND EXISTS (
          SELECT 1 FROM operator_team_members otm_me
          JOIN operator_team_members otm_them ON otm_them.unit_id = otm_me.unit_id
          WHERE otm_me.member_id = p_user_id AND otm_me.active = true
            AND otm_them.member_id = p.id AND otm_them.active = true
        ))
      )
  ),
  perf AS (
    SELECT
      c.user_id,
      COUNT(*) FILTER (WHERE c.showed_at IS NOT NULL) AS shows,
      COUNT(*) FILTER (WHERE c.result IN ('won','closed_won')) AS closes,
      COALESCE(SUM(c.revenue) FILTER (WHERE c.result IN ('won','closed_won')), 0) AS rev,
      CASE 
        WHEN COUNT(*) > 0 
        THEN ROUND(COUNT(*) FILTER (WHERE c.result IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 1)
        ELSE 0
      END AS comp_rate
    FROM calls c
    WHERE COALESCE(c.is_simulation, false) = false
      AND c.created_at >= now() - interval '30 days'
      AND c.user_id IN (SELECT id FROM base)
    GROUP BY c.user_id
  ),
  week_load AS (
    SELECT
      COALESCE(a.current_owner_id, a.setter_id) AS user_id,
      COUNT(*) AS cnt
    FROM appointments a
    WHERE a.appointment_status NOT IN ('cancelled','rescheduled','expired','superseded')
      AND a.starts_at >= date_trunc('week', now())
      AND a.starts_at < date_trunc('week', now()) + interval '7 days'
      AND COALESCE(a.current_owner_id, a.setter_id) IN (SELECT id FROM base)
    GROUP BY COALESCE(a.current_owner_id, a.setter_id)
  )
  SELECT
    b.id,
    b.full_name,
    b.email,
    b.current_phase,
    COALESCE(p.shows, 0) AS shows_30d,
    COALESCE(p.closes, 0) AS closes_30d,
    COALESCE(p.rev, 0) AS revenue_30d,
    COALESCE(p.comp_rate, 0) AS completion_rate,
    COALESCE(w.cnt, 0) AS appts_this_week
  FROM base b
  LEFT JOIN perf p ON p.user_id = b.id
  LEFT JOIN week_load w ON w.user_id = b.id
  ORDER BY COALESCE(p.closes, 0)::numeric / NULLIF(COALESCE(p.shows, 0), 0) DESC NULLS LAST, b.full_name;
$$;
