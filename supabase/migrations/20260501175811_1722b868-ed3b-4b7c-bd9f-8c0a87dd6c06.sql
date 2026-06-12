
-- Fix is_test_lead calls — existing function takes (is_simulation, name, email)
CREATE OR REPLACE FUNCTION public.compute_talent_scores(
  p_range_days int DEFAULT 30,
  p_team_lead_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  business_stage text,
  level_num int,
  operator_role text,
  total_leads int,
  total_bookings int,
  total_shows int,
  total_no_shows int,
  total_closes int,
  total_revenue numeric,
  booking_rate numeric,
  show_rate numeric,
  close_rate numeric,
  revenue_per_lead numeric,
  consistency_score numeric,
  activity_score numeric,
  data_hygiene_score numeric,
  talent_score numeric,
  talent_category text,
  talent_trend text,
  primary_bottleneck text,
  bottleneck_confidence numeric,
  recommended_action text,
  tenure_days int,
  joined_at timestamptz,
  active_flags_red int,
  active_flags_green int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_cutoff_14d timestamptz;
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;
  v_cutoff_14d := now() - interval '14 days';

  RETURN QUERY
  WITH level_map(stage_key, lvl, op_role) AS (
    VALUES
      ('prospect',0,'Lead'), ('opener',1,'Opener'), ('setter',2,'Setter'),
      ('senior_associate',3,'Senior Setter'), ('junior_manager',4,'Junior Closer'),
      ('manager',5,'Closer'), ('senior_manager',6,'Senior Closer'),
      ('director',7,'Director'), ('partner',8,'Partner')
  ),
  operators AS (
    SELECT 
      p.id,
      p.full_name,
      p.business_stage,
      COALESCE(lm.lvl, 0) AS lvl,
      COALESCE(lm.op_role, 'Unknown') AS op_role,
      p.created_at AS joined,
      GREATEST(0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)::int AS tenure
    FROM profiles p
    LEFT JOIN level_map lm ON lm.stage_key = p.business_stage
    WHERE p.business_stage NOT IN ('prospect')
      AND p.full_name NOT ILIKE '%test%'
      AND p.full_name NOT ILIKE '%e2e%'
      AND p.full_name NOT ILIKE '%qa %'
  ),
  lead_counts AS (
    SELECT 
      COALESCE(l.owner_id, l.setter_id, l.closer_id) AS op_id,
      COUNT(*) AS cnt
    FROM leads l
    WHERE l.is_simulation = false
      AND l.created_at >= v_cutoff
      AND NOT public.is_test_lead(l.is_simulation, l.name, l.email)
    GROUP BY 1
  ),
  appt_stats AS (
    SELECT 
      COALESCE(a.closer_id, a.setter_id, a.current_owner_id) AS op_id,
      COUNT(*) AS total_booked,
      COUNT(*) FILTER (WHERE a.appointment_status = 'completed' OR a.attendance_flag = true) AS total_showed,
      COUNT(*) FILTER (WHERE a.appointment_status = 'no_show' OR a.no_show_detected_at IS NOT NULL) AS total_noshows,
      COUNT(*) FILTER (WHERE a.outcome = 'closed_won') AS total_closed
    FROM appointments a
    JOIN leads l ON l.id = a.lead_id
    WHERE a.starts_at >= v_cutoff
      AND l.is_simulation = false
      AND NOT public.is_test_lead(l.is_simulation, l.name, l.email)
    GROUP BY 1
  ),
  rev_stats AS (
    SELECT 
      c.user_id AS op_id,
      COALESCE(SUM(c.revenue), 0) AS rev
    FROM calls c
    WHERE c.is_simulation = false
      AND c.created_at >= v_cutoff
      AND c.revenue > 0
    GROUP BY 1
  ),
  appt_14d AS (
    SELECT 
      COALESCE(a.closer_id, a.setter_id, a.current_owner_id) AS op_id,
      COUNT(*) AS booked_14d,
      COUNT(*) FILTER (WHERE a.appointment_status = 'completed' OR a.attendance_flag = true) AS showed_14d,
      COUNT(*) FILTER (WHERE a.outcome = 'closed_won') AS closed_14d
    FROM appointments a
    JOIN leads l ON l.id = a.lead_id
    WHERE a.starts_at >= v_cutoff_14d
      AND l.is_simulation = false
    GROUP BY 1
  ),
  flag_counts AS (
    SELECT
      tf.user_id AS op_id,
      COUNT(*) FILTER (WHERE tf.flag_type = 'red' AND tf.resolved_at IS NULL) AS reds,
      COUNT(*) FILTER (WHERE tf.flag_type = 'green' AND tf.resolved_at IS NULL) AS greens
    FROM talent_flags tf
    GROUP BY 1
  ),
  scored AS (
    SELECT
      o.id AS uid,
      o.full_name AS fname,
      o.business_stage AS bstage,
      o.lvl,
      o.op_role,
      o.joined,
      o.tenure,
      COALESCE(lc.cnt, 0)::int AS leads_cnt,
      COALESCE(ast.total_booked, 0)::int AS bookings_cnt,
      COALESCE(ast.total_showed, 0)::int AS shows_cnt,
      COALESCE(ast.total_noshows, 0)::int AS noshows_cnt,
      COALESCE(ast.total_closed, 0)::int AS closes_cnt,
      COALESCE(rs.rev, 0) AS revenue,
      CASE WHEN COALESCE(lc.cnt,0) > 0 THEN LEAST(100, COALESCE(ast.total_booked,0)::numeric / lc.cnt * 100) ELSE 0 END AS bk_rate,
      CASE WHEN COALESCE(ast.total_booked,0) > 0 THEN LEAST(100, COALESCE(ast.total_showed,0)::numeric / ast.total_booked * 100) ELSE 0 END AS sh_rate,
      CASE WHEN COALESCE(ast.total_showed,0) > 0 THEN LEAST(100, COALESCE(ast.total_closed,0)::numeric / ast.total_showed * 100) ELSE 0 END AS cl_rate,
      CASE WHEN COALESCE(lc.cnt,0) > 0 THEN COALESCE(rs.rev, 0) / lc.cnt ELSE 0 END AS rev_per_lead,
      CASE 
        WHEN COALESCE(ast.total_booked,0) > 0 AND COALESCE(a14.booked_14d,0) > 0 
        THEN LEAST(100, (COALESCE(a14.booked_14d,0)::numeric / GREATEST(1, ast.total_booked) * 2) * 100)
        WHEN COALESCE(ast.total_booked,0) = 0 AND COALESCE(a14.booked_14d,0) = 0 THEN 50
        ELSE 20
      END AS consist,
      LEAST(100, (COALESCE(ast.total_booked,0) + COALESCE(ast.total_showed,0))::numeric / GREATEST(1, p_range_days / 3) * 100) AS activity,
      50::numeric AS hygiene,
      COALESCE(fc.reds, 0)::int AS flag_reds,
      COALESCE(fc.greens, 0)::int AS flag_greens
    FROM operators o
    LEFT JOIN lead_counts lc ON lc.op_id = o.id
    LEFT JOIN appt_stats ast ON ast.op_id = o.id
    LEFT JOIN rev_stats rs ON rs.op_id = o.id
    LEFT JOIN appt_14d a14 ON a14.op_id = o.id
    LEFT JOIN flag_counts fc ON fc.op_id = o.id
  ),
  final AS (
    SELECT
      s.*,
      LEAST(100, GREATEST(0,
        s.cl_rate * 0.25 +
        s.sh_rate * 0.20 +
        s.bk_rate * 0.15 +
        LEAST(100, s.rev_per_lead / 50) * 0.15 +
        s.consist * 0.10 +
        s.activity * 0.10 +
        s.hygiene * 0.05
      )) AS tscore
    FROM scored s
  )
  SELECT
    f.uid, f.fname, f.bstage, f.lvl, f.op_role,
    f.leads_cnt, f.bookings_cnt, f.shows_cnt, f.noshows_cnt, f.closes_cnt, f.revenue,
    ROUND(f.bk_rate, 1), ROUND(f.sh_rate, 1), ROUND(f.cl_rate, 1), ROUND(f.rev_per_lead, 2),
    ROUND(f.consist, 1), ROUND(f.activity, 1), ROUND(f.hygiene, 1),
    ROUND(f.tscore, 1),
    CASE
      WHEN f.tscore >= 80 THEN 'A-Player'
      WHEN f.tscore >= 60 THEN 'Stable'
      WHEN f.tscore >= 40 THEN 'Risk'
      ELSE 'Replace'
    END,
    CASE
      WHEN f.consist >= 60 THEN 'up'
      WHEN f.consist <= 30 THEN 'down'
      ELSE 'stable'
    END,
    CASE
      WHEN f.shows_cnt > 2 AND f.cl_rate < 20 THEN 'Closing Skill'
      WHEN f.bookings_cnt > 2 AND f.sh_rate < 50 THEN 'Expectation Setting'
      WHEN f.leads_cnt > 3 AND f.bk_rate < 20 THEN 'Qualification / Setter'
      WHEN f.leads_cnt = 0 AND f.bookings_cnt = 0 THEN 'No Activity'
      ELSE 'Balanced'
    END,
    CASE
      WHEN f.shows_cnt > 2 AND f.cl_rate < 20 THEN LEAST(100, (1 - f.cl_rate/100) * 100)
      WHEN f.bookings_cnt > 2 AND f.sh_rate < 50 THEN LEAST(100, (1 - f.sh_rate/100) * 100)
      WHEN f.leads_cnt > 3 AND f.bk_rate < 20 THEN LEAST(100, (1 - f.bk_rate/100) * 100)
      ELSE 50
    END,
    CASE
      WHEN f.shows_cnt > 2 AND f.cl_rate < 20 THEN 'Closing Training + Call Review'
      WHEN f.bookings_cnt > 2 AND f.sh_rate < 50 THEN 'Expectation Setting + Reminder Optimization'
      WHEN f.leads_cnt > 3 AND f.bk_rate < 20 THEN 'Script Review + Shadowing'
      WHEN f.leads_cnt = 0 AND f.bookings_cnt = 0 THEN 'Assign leads or check availability'
      ELSE 'Maintain current trajectory'
    END,
    f.tenure, f.joined, f.flag_reds, f.flag_greens
  FROM final f
  ORDER BY f.tscore DESC;
END;
$$;
