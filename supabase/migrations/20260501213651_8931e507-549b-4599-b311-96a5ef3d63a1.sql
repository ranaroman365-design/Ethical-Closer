
-- Force recompilation by dropping and recreating
DROP FUNCTION IF EXISTS public.compute_talent_scores(integer, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.compute_talent_scores(
  p_range_days integer DEFAULT 30,
  p_user_id uuid DEFAULT NULL,
  p_funnel text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid, full_name text, business_stage text, level_num integer,
  operator_role text, tenure_days integer,
  total_leads integer, total_bookings integer, total_shows integer,
  total_closes integer, total_revenue numeric,
  booking_rate numeric, show_rate numeric, close_rate numeric,
  revenue_per_lead numeric, consistency_score numeric,
  activity_score numeric, hygiene_score numeric,
  talent_score numeric, talent_category text,
  primary_bottleneck text, bottleneck_confidence numeric,
  trend_7d numeric, sparkline_data numeric[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff timestamptz; v_cutoff_14d timestamptz; v_team_ids uuid[];
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;
  v_cutoff_14d := now() - interval '14 days';
  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sub.id) INTO v_team_ids FROM (
      SELECT p_user_id AS id UNION SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm
    ) sub;
  END IF;

  RETURN QUERY
  WITH level_map(stage_key, lvl, op_role) AS (VALUES
    ('prospect',0,'Lead'),('opener',1,'Opener'),('setter',2,'Setter'),
    ('associate_setter',2,'Setter'),('associate',2,'Setter'),
    ('senior_associate',3,'Senior Setter'),('senior_setter',3,'Senior Setter'),
    ('junior_manager',4,'Junior Closer'),('manager',5,'Closer'),('senior_manager',6,'Senior Closer'),
    ('trainee',1,'Opener'),('applicant',0,'Lead'),('director',7,'Director'),('partner',8,'Partner')
  ),
  operators AS (
    SELECT p.id, p.full_name, p.business_stage AS bstage,
      COALESCE(lm.lvl, COALESCE(p.current_phase,0)) AS lvl,
      COALESCE(lm.op_role,'Unknown') AS op_role,
      GREATEST(0, EXTRACT(EPOCH FROM (now()-p.created_at))/86400)::int AS tenure
    FROM profiles p LEFT JOIN level_map lm ON lm.stage_key=p.business_stage
    WHERE p.business_stage NOT IN ('prospect')
      AND p.full_name NOT ILIKE '%test%' AND p.full_name NOT ILIKE '%e2e%' AND p.full_name NOT ILIKE '%qa %'
      AND (v_team_ids IS NULL OR p.id = ANY(v_team_ids))
      AND (p_operator_id IS NULL OR p.id = p_operator_id)
  ),
  -- Explicitly list columns instead of rl.* to avoid stale column cache
  filtered_leads AS (
    SELECT rl.id, rl.created_at, rl.name, rl.source, rl.owner_id, rl.setter_id, rl.closer_id,
           rl.outcome, rl.payment_status, rl.is_simulation
    FROM real_leads_view rl WHERE rl.created_at >= v_cutoff
      AND (p_funnel IS NULL OR canonical_funnel_source(rl.source)=p_funnel)
      AND rl.is_simulation IS NOT TRUE
      AND rl.name NOT ILIKE 'test%' AND rl.name NOT ILIKE '%kein lead%' AND rl.name NOT ILIKE '%test test%'
  ),
  lead_counts AS (SELECT COALESCE(fl.owner_id,fl.setter_id,fl.closer_id) AS op_id, COUNT(*) AS cnt FROM filtered_leads fl GROUP BY 1),
  booking_counts AS (
    SELECT COALESCE(ra.assigned_operator_id,ra.setter_id,ra.closer_id) AS op_id, COUNT(*) AS cnt
    FROM real_appointments_view ra WHERE ra.starts_at >= v_cutoff
      AND ra.appointment_status NOT IN ('rescheduled','superseded')
      AND (p_funnel IS NULL OR EXISTS (SELECT 1 FROM filtered_leads fl WHERE fl.id=ra.lead_id))
    GROUP BY 1
  ),
  show_counts AS (
    SELECT COALESCE(ra.assigned_operator_id,ra.setter_id,ra.closer_id) AS op_id, COUNT(*) AS cnt
    FROM real_appointments_view ra WHERE ra.starts_at >= v_cutoff AND ra.starts_at <= now()
      AND ra.appointment_status NOT IN ('no_show','cancelled','expired','superseded','rescheduled')
      AND (ra.completed_at IS NOT NULL OR ra.call_started_at IS NOT NULL)
      AND (p_funnel IS NULL OR EXISTS (SELECT 1 FROM filtered_leads fl WHERE fl.id=ra.lead_id))
    GROUP BY 1
  ),
  close_counts AS (
    SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id,
      COUNT(*) FILTER (WHERE canonical_lead_revenue(fl.id) > 0 OR fl.outcome='won' OR fl.payment_status='paid') AS cnt,
      SUM(COALESCE(canonical_lead_revenue(fl.id), 0)) AS rev
    FROM filtered_leads fl
    WHERE (fl.outcome='won' OR fl.payment_status='paid' OR canonical_lead_revenue(fl.id) > 0)
    GROUP BY 1
  ),
  weekly AS (
    SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id, EXTRACT(WEEK FROM fl.created_at) AS wk, COUNT(*) AS cnt
    FROM filtered_leads fl WHERE (fl.outcome='won' OR fl.payment_status='paid' OR canonical_lead_revenue(fl.id) > 0) GROUP BY 1,2
  ),
  consistency AS (SELECT op_id, CASE WHEN COUNT(*)<2 THEN 0 ELSE GREATEST(0,100-(STDDEV(cnt)/NULLIF(AVG(cnt),0)*100)) END AS score FROM weekly GROUP BY 1),
  activity AS (SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id, COUNT(*) FILTER (WHERE fl.created_at >= now()-interval '7 days') AS last7 FROM filtered_leads fl GROUP BY 1),
  hygiene AS (
    SELECT p.id AS op_id, (
      CASE WHEN p.full_name IS NOT NULL AND LENGTH(TRIM(p.full_name))>2 THEN 20 ELSE 0 END
      + CASE WHEN p.email IS NOT NULL AND p.email LIKE '%@%' THEN 20 ELSE 0 END
      + CASE WHEN p.business_stage IS NOT NULL THEN 20 ELSE 0 END
      + CASE WHEN p.avatar_url IS NOT NULL THEN 20 ELSE 0 END
      + 20
    ) AS score FROM profiles p
  ),
  trend AS (
    SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id,
      SUM(CASE WHEN fl.created_at >= v_cutoff_14d THEN canonical_lead_revenue(fl.id) ELSE 0 END) -
      SUM(CASE WHEN fl.created_at < v_cutoff_14d AND fl.created_at >= v_cutoff THEN canonical_lead_revenue(fl.id) ELSE 0 END) AS delta
    FROM filtered_leads fl GROUP BY 1
  ),
  spark AS (
    SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id,
      ARRAY_AGG(COALESCE(wrev.r,0) ORDER BY wrev.w) AS data
    FROM (SELECT DISTINCT COALESCE(closer_id,owner_id) AS op_id FROM filtered_leads) fl
    CROSS JOIN LATERAL (
      SELECT w, COALESCE(SUM(canonical_lead_revenue(fl2.id)),0) AS r
      FROM generate_series(1,4) AS w
      LEFT JOIN filtered_leads fl2 ON COALESCE(fl2.closer_id,fl2.owner_id)=fl.op_id
        AND EXTRACT(WEEK FROM fl2.created_at)%4+1=w
      GROUP BY w
    ) wrev GROUP BY 1
  ),
  scored AS (
    SELECT o.id, o.full_name, o.bstage, o.lvl, o.op_role, o.tenure,
      COALESCE(lc.cnt,0)::int AS t_leads,
      COALESCE(bc.cnt,0)::int AS t_book,
      COALESCE(sc.cnt,0)::int AS t_show,
      COALESCE(cc.cnt,0)::int AS t_close,
      COALESCE(cc.rev,0) AS t_rev,
      CASE WHEN COALESCE(lc.cnt,0)>0 THEN ROUND(COALESCE(bc.cnt,0)::numeric/lc.cnt*100,1) ELSE 0 END AS br,
      CASE WHEN COALESCE(bc.cnt,0)>0 THEN ROUND(COALESCE(sc.cnt,0)::numeric/bc.cnt*100,1) ELSE 0 END AS sr,
      CASE WHEN COALESCE(sc.cnt,0)>0 THEN ROUND(COALESCE(cc.cnt,0)::numeric/sc.cnt*100,1) ELSE 0 END AS cr,
      CASE WHEN COALESCE(lc.cnt,0)>0 THEN ROUND(COALESCE(cc.rev,0)/lc.cnt,2) ELSE 0 END AS rpl,
      COALESCE(con.score,0)::numeric AS con_s,
      LEAST(100, COALESCE(act.last7,0)*15)::numeric AS act_s,
      COALESCE(hyg.score,0)::numeric AS hyg_s,
      COALESCE(tr.delta,0)::numeric AS tr_d,
      COALESCE(sp.data, ARRAY[0,0,0,0]::numeric[]) AS sp_d
    FROM operators o
    LEFT JOIN lead_counts lc ON lc.op_id=o.id
    LEFT JOIN booking_counts bc ON bc.op_id=o.id
    LEFT JOIN show_counts sc ON sc.op_id=o.id
    LEFT JOIN close_counts cc ON cc.op_id=o.id
    LEFT JOIN consistency con ON con.op_id=o.id
    LEFT JOIN activity act ON act.op_id=o.id
    LEFT JOIN hygiene hyg ON hyg.op_id=o.id
    LEFT JOIN trend tr ON tr.op_id=o.id
    LEFT JOIN spark sp ON sp.op_id=o.id
  )
  SELECT s.id, s.full_name, s.bstage, s.lvl, s.op_role, s.tenure,
    s.t_leads, s.t_book, s.t_show, s.t_close, s.t_rev,
    s.br, s.sr, s.cr, s.rpl, s.con_s, s.act_s, s.hyg_s,
    ROUND(s.cr*0.25+s.sr*0.20+s.br*0.15+s.rpl/NULLIF(GREATEST(s.rpl,1),0)*100*0.15+s.con_s*0.10+s.act_s*0.10+s.hyg_s*0.05,1) AS talent_score,
    CASE
      WHEN ROUND(s.cr*0.25+s.sr*0.20+s.br*0.15+s.rpl/NULLIF(GREATEST(s.rpl,1),0)*100*0.15+s.con_s*0.10+s.act_s*0.10+s.hyg_s*0.05,1) >= 75 THEN 'A-Player'
      WHEN ROUND(s.cr*0.25+s.sr*0.20+s.br*0.15+s.rpl/NULLIF(GREATEST(s.rpl,1),0)*100*0.15+s.con_s*0.10+s.act_s*0.10+s.hyg_s*0.05,1) >= 50 THEN 'Stable'
      WHEN ROUND(s.cr*0.25+s.sr*0.20+s.br*0.15+s.rpl/NULLIF(GREATEST(s.rpl,1),0)*100*0.15+s.con_s*0.10+s.act_s*0.10+s.hyg_s*0.05,1) >= 30 THEN 'Risk'
      ELSE 'Replace'
    END,
    CASE
      WHEN s.cr < 15 THEN 'close_rate'
      WHEN s.sr < 50 THEN 'show_rate'
      WHEN s.br < 20 THEN 'booking_rate'
      WHEN s.rpl < 200 THEN 'revenue_per_lead'
      WHEN s.act_s < 30 THEN 'activity'
      ELSE 'none'
    END,
    CASE
      WHEN s.cr < 15 THEN 90
      WHEN s.sr < 50 THEN 85
      WHEN s.br < 20 THEN 80
      ELSE 50
    END::numeric,
    s.tr_d,
    s.sp_d
  FROM scored s
  ORDER BY talent_score DESC;
END;
$$;
