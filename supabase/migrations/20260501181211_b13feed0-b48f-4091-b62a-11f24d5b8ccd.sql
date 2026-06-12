
DROP FUNCTION IF EXISTS public.compute_talent_scores(int, uuid);

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
LANGUAGE plpgsql
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
    WHERE l.created_at >= v_cutoff
      AND NOT COALESCE(l.is_simulation, false)
    GROUP BY 1
  ),
  booking_counts AS (
    SELECT 
      COALESCE(a.setter_id, a.closer_id) AS op_id,
      COUNT(*) AS cnt
    FROM appointments a
    WHERE a.starts_at >= v_cutoff
    GROUP BY 1
  ),
  show_counts AS (
    SELECT 
      COALESCE(a.setter_id, a.closer_id) AS op_id,
      COUNT(*) AS cnt
    FROM appointments a
    WHERE a.starts_at >= v_cutoff
      AND a.status IN ('completed', 'showed')
    GROUP BY 1
  ),
  close_counts AS (
    SELECT c.user_id AS op_id, COUNT(*) AS cnt, SUM(COALESCE(c.revenue,0)) AS rev
    FROM calls c
    WHERE c.created_at >= v_cutoff AND c.outcome = 'closed'
    GROUP BY 1
  ),
  weekly AS (
    SELECT c.user_id AS op_id,
      EXTRACT(WEEK FROM c.created_at) AS wk,
      COUNT(*) AS cnt
    FROM calls c
    WHERE c.created_at >= v_cutoff
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
    GROUP BY 1
  ),
  sparkline AS (
    SELECT c.user_id AS op_id,
      ARRAY_AGG(
        COALESCE(day_rev, 0) ORDER BY d
      ) AS spark
    FROM (
      SELECT c2.user_id, d::date AS d, SUM(COALESCE(c2.revenue,0)) AS day_rev
      FROM generate_series(v_cutoff_14d, now(), '1 day') d
      LEFT JOIN calls c2 ON c2.created_at::date = d::date AND c2.outcome = 'closed'
      GROUP BY c2.user_id, d::date
    ) c
    GROUP BY c.user_id
  ),
  combined AS (
    SELECT
      o.id,
      o.full_name,
      o.business_stage AS bstage,
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
      CASE WHEN o.full_name IS NOT NULL AND LENGTH(o.full_name) > 2 THEN 100 ELSE 50 END::numeric AS hyg,
      COALESCE(sp.spark, ARRAY[]::numeric[]) AS spark
    FROM operators o
    LEFT JOIN lead_counts lc ON lc.op_id = o.id
    LEFT JOIN booking_counts bc ON bc.op_id = o.id
    LEFT JOIN show_counts sc ON sc.op_id = o.id
    LEFT JOIN close_counts cc ON cc.op_id = o.id
    LEFT JOIN consistency con ON con.op_id = o.id
    LEFT JOIN activity act ON act.op_id = o.id
    LEFT JOIN sparkline sp ON sp.op_id = o.id
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
      WHEN s.brate < 20 THEN 'Lead Engagement'
      WHEN s.activ < 30 THEN 'Activity Volume'
      ELSE 'No Major Issue'
    END,
    CASE
      WHEN s.tscore < 25 THEN 90
      WHEN s.tscore < 50 THEN 70
      ELSE 40
    END::numeric,
    COALESCE(
      (SELECT ROUND(AVG(x.tscore2),1) FROM (
        SELECT ROUND(cc2.cnt::numeric / NULLIF(sc2.cnt,0) * 100 * 0.25, 1) AS tscore2
        FROM calls cc3
        JOIN (SELECT user_id, COUNT(*) AS cnt FROM calls WHERE created_at >= now()-interval '7 days' AND outcome='closed' GROUP BY 1) cc2 ON cc2.user_id = s.id
        JOIN (SELECT COALESCE(setter_id,closer_id) AS op_id, COUNT(*) AS cnt FROM appointments WHERE starts_at >= now()-interval '7 days' AND status IN ('completed','showed') GROUP BY 1) sc2 ON sc2.op_id = s.id
        WHERE cc3.user_id = s.id AND cc3.created_at >= now()-interval '7 days'
        LIMIT 1
      ) x), 0
    ) - s.tscore AS trend,
    s.spark
  FROM scored s
  ORDER BY s.tscore DESC;
END;
$$;
