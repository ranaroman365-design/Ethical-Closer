
CREATE OR REPLACE FUNCTION public.compute_talent_scores(
  p_range_days int DEFAULT 30,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  business_stage text,
  level_num int,
  operator_role text,
  tenure_days int,
  total_leads int,
  total_bookings int,
  total_shows int,
  total_closes int,
  total_revenue numeric,
  booking_rate numeric,
  show_rate numeric,
  close_rate numeric,
  revenue_per_lead numeric,
  consistency_score numeric,
  activity_score numeric,
  hygiene_score numeric,
  talent_score numeric,
  talent_category text,
  primary_bottleneck text,
  bottleneck_confidence numeric,
  trend_7d numeric,
  sparkline_data numeric[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_cutoff_14d timestamptz;
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;
  v_cutoff_14d := now() - interval '14 days';

  RETURN QUERY
  WITH team_scope AS (
    SELECT tm.id AS member_id
    FROM profiles tm
    WHERE p_user_id IS NULL
       OR tm.id = p_user_id
       OR tm.id IN (SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm)
  ),
  level_map(stage_key, lvl, op_role) AS (
    VALUES
      ('prospect',0,'Lead'), ('opener',1,'Opener'), ('setter',2,'Setter'),
      ('associate_setter',2,'Setter'), ('associate',2,'Setter'),
      ('senior_associate',3,'Senior Setter'), ('senior_setter',3,'Senior Setter'),
      ('junior_manager',4,'Junior Closer'),
      ('manager',5,'Closer'), ('senior_manager',6,'Senior Closer'),
      ('trainee',1,'Opener'), ('applicant',0,'Lead'),
      ('director',7,'Director'), ('partner',8,'Partner')
  ),
  operators AS (
    SELECT 
      p.id,
      p.full_name,
      p.business_stage AS bstage,
      COALESCE(lm.lvl, COALESCE(p.current_phase, 0)) AS lvl,
      COALESCE(lm.op_role, 'Unknown') AS op_role,
      GREATEST(0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)::int AS tenure
    FROM profiles p
    LEFT JOIN level_map lm ON lm.stage_key = p.business_stage
    INNER JOIN team_scope ts ON ts.member_id = p.id
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
    WHERE l.created_at >= v_cutoff
      AND NOT COALESCE(l.is_simulation, false)
    GROUP BY 1
  ),
  booking_counts AS (
    SELECT 
      COALESCE(a.assigned_operator_id, a.setter_id, a.closer_id) AS op_id,
      COUNT(*) AS cnt
    FROM appointments a
    WHERE a.starts_at >= v_cutoff
    GROUP BY 1
  ),
  show_counts AS (
    SELECT 
      COALESCE(a.assigned_operator_id, a.setter_id, a.closer_id) AS op_id,
      COUNT(*) AS cnt
    FROM appointments a
    WHERE a.starts_at >= v_cutoff
      AND a.starts_at <= now()
      AND a.appointment_status NOT IN ('no_show', 'cancelled', 'expired', 'superseded')
      AND (a.completed_at IS NOT NULL OR a.call_started_at IS NOT NULL)
    GROUP BY 1
  ),
  close_counts AS (
    SELECT c.user_id AS op_id, COUNT(*) AS cnt, SUM(COALESCE(c.revenue, 0)) AS rev
    FROM calls c
    WHERE c.created_at >= v_cutoff
      AND NOT COALESCE(c.is_simulation, false)
      AND (c.closed_at IS NOT NULL OR c.result = 'closed')
    GROUP BY 1
  ),
  weekly AS (
    SELECT c.user_id AS op_id,
      EXTRACT(WEEK FROM c.created_at) AS wk,
      COUNT(*) AS cnt
    FROM calls c
    WHERE c.created_at >= v_cutoff
      AND NOT COALESCE(c.is_simulation, false)
    GROUP BY 1,2
  ),
  consistency AS (
    SELECT op_id,
      CASE WHEN COUNT(*) < 2 THEN 0
           ELSE GREATEST(0, 100 - (STDDEV(cnt) / NULLIF(AVG(cnt),0) * 100))
      END AS score
    FROM weekly GROUP BY 1
  ),
  activity AS (
    SELECT c.user_id AS op_id,
      COUNT(*) FILTER (WHERE c.created_at >= now() - interval '7 days') AS last7
    FROM calls c
    WHERE c.created_at >= v_cutoff
      AND NOT COALESCE(c.is_simulation, false)
    GROUP BY 1
  ),
  hygiene AS (
    SELECT p.id AS op_id,
      (
        CASE WHEN p.full_name IS NOT NULL AND LENGTH(TRIM(p.full_name)) > 2 THEN 20 ELSE 0 END
        + CASE WHEN p.email IS NOT NULL AND p.email LIKE '%@%' THEN 20 ELSE 0 END
        + CASE WHEN p.phone IS NOT NULL AND LENGTH(p.phone) > 5 THEN 20 ELSE 0 END
        + CASE WHEN p.avatar_url IS NOT NULL THEN 20 ELSE 0 END
        + CASE WHEN p.business_stage IS NOT NULL AND p.business_stage <> 'prospect' THEN 20 ELSE 0 END
      )::numeric AS score
    FROM profiles p
  ),
  sparkline_data AS (
    SELECT c_agg.user_id AS op_id,
      ARRAY_AGG(COALESCE(c_agg.day_rev, 0) ORDER BY c_agg.d) AS spark
    FROM (
      SELECT c2.user_id, d::date AS d, SUM(COALESCE(c2.revenue,0)) AS day_rev
      FROM generate_series(v_cutoff_14d, now(), '1 day') d
      LEFT JOIN calls c2 ON c2.created_at::date = d::date 
        AND (c2.closed_at IS NOT NULL OR c2.result = 'closed')
        AND NOT COALESCE(c2.is_simulation, false)
      GROUP BY c2.user_id, d::date
    ) c_agg
    WHERE c_agg.user_id IS NOT NULL
    GROUP BY c_agg.user_id
  ),
  combined AS (
    SELECT
      o.id,
      o.full_name,
      o.bstage,
      o.lvl,
      o.op_role,
      o.tenure,
      COALESCE(lc.cnt, 0)::int AS leads,
      COALESCE(bc.cnt, 0)::int AS bookings,
      COALESCE(sc.cnt, 0)::int AS shows,
      COALESCE(cc.cnt, 0)::int AS closes,
      COALESCE(cc.rev, 0)::numeric AS rev,
      CASE WHEN COALESCE(lc.cnt,0)>0 THEN ROUND(COALESCE(bc.cnt,0)::numeric / lc.cnt * 100, 1) ELSE 0 END AS brate,
      CASE WHEN COALESCE(bc.cnt,0)>0 THEN ROUND(COALESCE(sc.cnt,0)::numeric / bc.cnt * 100, 1) ELSE 0 END AS srate,
      CASE WHEN COALESCE(sc.cnt,0)>0 THEN ROUND(COALESCE(cc.cnt,0)::numeric / sc.cnt * 100, 1) ELSE 0 END AS crate,
      CASE WHEN COALESCE(lc.cnt,0)>0 THEN ROUND(COALESCE(cc.rev,0)::numeric / lc.cnt, 2) ELSE 0 END AS rpl,
      COALESCE(con.score, 0)::numeric AS consist,
      LEAST(100, COALESCE(act.last7, 0) * 10)::numeric AS activ,
      COALESCE(h.score, 0)::numeric AS hyg,
      COALESCE(sp.spark, ARRAY[]::numeric[]) AS spark
    FROM operators o
    LEFT JOIN lead_counts lc ON lc.op_id = o.id
    LEFT JOIN booking_counts bc ON bc.op_id = o.id
    LEFT JOIN show_counts sc ON sc.op_id = o.id
    LEFT JOIN close_counts cc ON cc.op_id = o.id
    LEFT JOIN consistency con ON con.op_id = o.id
    LEFT JOIN activity act ON act.op_id = o.id
    LEFT JOIN hygiene h ON h.op_id = o.id
    LEFT JOIN sparkline_data sp ON sp.op_id = o.id
  ),
  scored AS (
    SELECT *,
      ROUND(
        crate * 0.25 + srate * 0.20 + brate * 0.15 + LEAST(rpl, 100) * 0.15 +
        consist * 0.10 + activ * 0.10 + hyg * 0.05
      , 1) AS tscore
    FROM combined
  )
  SELECT
    s.id,
    s.full_name,
    s.bstage,
    s.lvl,
    s.op_role,
    s.tenure,
    s.leads,
    s.bookings,
    s.shows,
    s.closes,
    s.rev,
    s.brate,
    s.srate,
    s.crate,
    s.rpl,
    s.consist,
    s.activ,
    s.hyg,
    s.tscore,
    CASE
      WHEN s.tscore >= 75 THEN 'a_player'
      WHEN s.tscore >= 50 THEN 'stable'
      WHEN s.tscore >= 25 THEN 'risk'
      ELSE 'replace'
    END,
    CASE
      WHEN s.crate < s.srate AND s.crate < s.brate THEN 'Closing Skill'
      WHEN s.srate < s.brate THEN 'Expectation Setting'
      WHEN s.brate < 20 AND s.leads > 0 THEN 'Lead Engagement'
      WHEN s.activ < 30 THEN 'Activity Volume'
      ELSE 'No Major Issue'
    END,
    CASE
      WHEN s.tscore < 25 THEN 90
      WHEN s.tscore < 50 THEN 70
      ELSE 40
    END::numeric,
    0::numeric,
    s.spark
  FROM scored s
  ORDER BY s.tscore DESC;
END;
$$;
