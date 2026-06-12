
-- 1. Update compute_talent_scores: fix category thresholds to spec (80/60/40)
CREATE OR REPLACE FUNCTION public.compute_talent_scores(
  p_range_days int DEFAULT 30,
  p_user_id uuid DEFAULT NULL,
  p_funnel text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid, full_name text, business_stage text, level_num int, operator_role text,
  tenure_days int, total_leads int, total_bookings int, total_shows int, total_closes int,
  total_revenue numeric, booking_rate numeric, show_rate numeric, close_rate numeric,
  revenue_per_lead numeric, consistency_score numeric, activity_score numeric,
  hygiene_score numeric, talent_score numeric, talent_category text,
  primary_bottleneck text, bottleneck_confidence numeric, trend_7d numeric,
  sparkline_data numeric[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cutoff timestamptz;
  v_cutoff_14d timestamptz;
  v_team_ids uuid[];
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;
  v_cutoff_14d := now() - interval '14 days';

  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sub.id) INTO v_team_ids
    FROM (
      SELECT p_user_id AS id
      UNION
      SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm
    ) sub;
  END IF;

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
      p.id, p.full_name, p.business_stage AS bstage,
      COALESCE(lm.lvl, COALESCE(p.current_phase, 0)) AS lvl,
      COALESCE(lm.op_role, 'Unknown') AS op_role,
      GREATEST(0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)::int AS tenure
    FROM profiles p
    LEFT JOIN level_map lm ON lm.stage_key = p.business_stage
    WHERE p.business_stage NOT IN ('prospect')
      AND p.full_name NOT ILIKE '%test%'
      AND p.full_name NOT ILIKE '%e2e%'
      AND p.full_name NOT ILIKE '%qa %'
      AND (v_team_ids IS NULL OR p.id = ANY(v_team_ids))
      AND (p_operator_id IS NULL OR p.id = p_operator_id)
  ),
  filtered_leads AS (
    SELECT rl.*
    FROM real_leads_view rl
    WHERE rl.created_at >= v_cutoff
      AND (p_funnel IS NULL OR canonical_funnel_source(rl.source) = p_funnel)
      AND rl.is_simulation IS NOT TRUE
      AND rl.full_name NOT ILIKE 'test%'
      AND rl.full_name NOT ILIKE '%kein lead%'
      AND rl.full_name NOT ILIKE '%test test%'
  ),
  lead_counts AS (
    SELECT COALESCE(fl.owner_id, fl.setter_id, fl.closer_id) AS op_id, COUNT(*) AS cnt
    FROM filtered_leads fl GROUP BY 1
  ),
  booking_counts AS (
    SELECT COALESCE(a.assigned_operator_id, a.setter_id, a.closer_id) AS op_id, COUNT(*) AS cnt
    FROM appointments a
    WHERE a.starts_at >= v_cutoff
      AND (p_funnel IS NULL OR EXISTS (SELECT 1 FROM filtered_leads fl WHERE fl.id = a.lead_id))
    GROUP BY 1
  ),
  show_counts AS (
    SELECT COALESCE(a.assigned_operator_id, a.setter_id, a.closer_id) AS op_id, COUNT(*) AS cnt
    FROM appointments a
    WHERE a.starts_at >= v_cutoff AND a.starts_at <= now()
      AND a.appointment_status NOT IN ('no_show', 'cancelled', 'expired', 'superseded')
      AND (a.completed_at IS NOT NULL OR a.call_started_at IS NOT NULL)
      AND (p_funnel IS NULL OR EXISTS (SELECT 1 FROM filtered_leads fl WHERE fl.id = a.lead_id))
    GROUP BY 1
  ),
  close_counts AS (
    SELECT COALESCE(fl.closer_id, fl.owner_id) AS op_id, COUNT(*) AS cnt, SUM(COALESCE(fl.deal_value, 0)) AS rev
    FROM filtered_leads fl
    WHERE (fl.outcome = 'won' OR fl.payment_status = 'paid')
    GROUP BY 1
  ),
  weekly AS (
    SELECT COALESCE(fl.closer_id, fl.owner_id) AS op_id,
      EXTRACT(WEEK FROM fl.created_at) AS wk, COUNT(*) AS cnt
    FROM filtered_leads fl
    WHERE (fl.outcome = 'won' OR fl.payment_status = 'paid')
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
    SELECT COALESCE(fl.closer_id, fl.owner_id) AS op_id,
      COUNT(*) FILTER (WHERE fl.created_at >= now() - interval '7 days') AS last7
    FROM filtered_leads fl GROUP BY 1
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
  sparkline_cte AS (
    SELECT c_agg.op_user AS op_id, ARRAY_AGG(COALESCE(c_agg.day_rev, 0) ORDER BY c_agg.d) AS spark
    FROM (
      SELECT COALESCE(fl.closer_id, fl.owner_id) AS op_user,
        d::date AS d, SUM(COALESCE(fl.deal_value, 0)) AS day_rev
      FROM generate_series(v_cutoff_14d, now(), '1 day') d
      LEFT JOIN filtered_leads fl ON fl.created_at::date = d::date
        AND (fl.outcome = 'won' OR fl.payment_status = 'paid')
      GROUP BY COALESCE(fl.closer_id, fl.owner_id), d::date
    ) c_agg WHERE c_agg.op_user IS NOT NULL GROUP BY c_agg.op_user
  ),
  combined AS (
    SELECT o.id, o.full_name, o.bstage, o.lvl, o.op_role, o.tenure,
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
    LEFT JOIN sparkline_cte sp ON sp.op_id = o.id
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
    s.id, s.full_name, s.bstage, s.lvl, s.op_role, s.tenure,
    s.leads, s.bookings, s.shows, s.closes, s.rev,
    s.brate, s.srate, s.crate, s.rpl, s.consist, s.activ, s.hyg, s.tscore,
    -- UPDATED THRESHOLDS: 80/60/40 per spec
    CASE
      WHEN s.tscore >= 80 THEN 'a_player'
      WHEN s.tscore >= 60 THEN 'stable'
      WHEN s.tscore >= 40 THEN 'risk'
      ELSE 'critical'
    END,
    CASE
      WHEN s.crate < s.srate AND s.crate < s.brate THEN 'Closing Skill'
      WHEN s.srate < s.brate THEN 'Expectation Setting'
      WHEN s.brate < 20 AND s.leads > 0 THEN 'Lead Engagement'
      WHEN s.activ < 30 THEN 'Activity Volume'
      ELSE 'No Major Issue'
    END,
    CASE WHEN s.tscore < 25 THEN 90 WHEN s.tscore < 50 THEN 70 ELSE 40 END::numeric,
    0::numeric,
    s.spark
  FROM scored s
  ORDER BY s.tscore DESC;
END;
$$;

-- 2. get_operator_diagnostics RPC
CREATE OR REPLACE FUNCTION public.get_operator_diagnostics(p_user_id uuid)
RETURNS TABLE(
  user_id uuid, primary_issue text, confidence_score numeric,
  recommended_action text, secondary_issues jsonb, computed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Return from talent_diagnostics if exists, otherwise compute live
  RETURN QUERY
  SELECT td.user_id, td.primary_issue, td.confidence_score,
    td.recommended_action, td.secondary_issues, td.computed_at
  FROM talent_diagnostics td
  WHERE td.user_id = p_user_id
  ORDER BY td.computed_at DESC
  LIMIT 1;

  -- If no stored diagnostic, compute on-the-fly from talent scores
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT ts.user_id, ts.primary_bottleneck, ts.bottleneck_confidence,
      CASE
        WHEN ts.close_rate < 10 THEN 'Closing Training Required'
        WHEN ts.show_rate < 50 THEN 'Improve confirmation + reminders'
        WHEN ts.booking_rate < 20 THEN 'Lead engagement training'
        WHEN ts.activity_score < 30 THEN 'Increase activity volume'
        ELSE 'Continue monitoring'
      END::text,
      '{}'::jsonb,
      now()
    FROM compute_talent_scores(30) ts
    WHERE ts.user_id = p_user_id
    LIMIT 1;
  END IF;
END;
$$;

-- 3. get_talent_actions RPC (filtered for one user)
CREATE OR REPLACE FUNCTION public.get_talent_actions(p_user_id uuid)
RETURNS TABLE(
  id uuid, user_id uuid, action_type text, title text,
  description text, status text, due_date date, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ta.id, ta.user_id, ta.action_type, ta.title,
    ta.description, ta.status, ta.due_date, ta.created_at
  FROM talent_actions ta
  WHERE ta.user_id = p_user_id
    AND ta.status NOT IN ('dismissed')
  ORDER BY ta.created_at DESC
  LIMIT 20;
END;
$$;

-- 4. Refresh talent_diagnostics via compute (called by system/cron)
CREATE OR REPLACE FUNCTION public.refresh_talent_diagnostics()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Upsert diagnostics from latest talent scores
  INSERT INTO talent_diagnostics (id, user_id, primary_issue, confidence_score, recommended_action, secondary_issues, computed_at)
  SELECT
    gen_random_uuid(),
    ts.user_id,
    ts.primary_bottleneck,
    ts.bottleneck_confidence,
    CASE
      WHEN ts.close_rate < 10 THEN 'Closing Training Required'
      WHEN ts.show_rate < 50 THEN 'Improve confirmation + reminders'
      WHEN ts.booking_rate < 20 THEN 'Lead engagement training'
      WHEN ts.activity_score < 30 THEN 'Increase activity volume'
      WHEN ts.talent_score < 40 THEN 'Downgrade / Replace Candidate'
      ELSE 'Continue monitoring'
    END,
    jsonb_build_object(
      'close_rate', ts.close_rate,
      'show_rate', ts.show_rate,
      'booking_rate', ts.booking_rate,
      'activity_score', ts.activity_score,
      'talent_score', ts.talent_score,
      'category', ts.talent_category
    ),
    now()
  FROM compute_talent_scores(30) ts
  ON CONFLICT (user_id) DO UPDATE SET
    primary_issue = EXCLUDED.primary_issue,
    confidence_score = EXCLUDED.confidence_score,
    recommended_action = EXCLUDED.recommended_action,
    secondary_issues = EXCLUDED.secondary_issues,
    computed_at = EXCLUDED.computed_at;
END;
$$;

-- 5. Add unique constraint on talent_diagnostics.user_id for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'talent_diagnostics_user_id_key'
  ) THEN
    ALTER TABLE talent_diagnostics ADD CONSTRAINT talent_diagnostics_user_id_key UNIQUE (user_id);
  END IF;
END;
$$;

-- 6. Auto-generate talent flags (called by system/cron)
CREATE OR REPLACE FUNCTION public.refresh_talent_flags()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Clear old unresolved auto-flags
  DELETE FROM talent_flags WHERE resolved_at IS NULL AND flag_key LIKE 'auto_%';

  -- Red flags
  INSERT INTO talent_flags (id, user_id, flag_type, flag_key, title, details)
  SELECT gen_random_uuid(), ts.user_id, 'red', 'auto_zero_revenue',
    ts.full_name || ': 0 Revenue in 14 Tagen',
    jsonb_build_object('total_revenue', ts.total_revenue, 'days', 14)
  FROM compute_talent_scores(14) ts
  WHERE ts.total_revenue = 0 AND ts.total_leads >= 5;

  INSERT INTO talent_flags (id, user_id, flag_type, flag_key, title, details)
  SELECT gen_random_uuid(), ts.user_id, 'red', 'auto_critical_score',
    ts.full_name || ': Score unter 40 (Critical)',
    jsonb_build_object('talent_score', ts.talent_score, 'category', ts.talent_category)
  FROM compute_talent_scores(30) ts
  WHERE ts.talent_score < 40;

  INSERT INTO talent_flags (id, user_id, flag_type, flag_key, title, details)
  SELECT gen_random_uuid(), ts.user_id, 'red', 'auto_score_drop',
    ts.full_name || ': Score Drop > 30%',
    jsonb_build_object('trend_7d', ts.trend_7d)
  FROM compute_talent_scores(30) ts
  WHERE ts.trend_7d < -30;

  -- Green flags
  INSERT INTO talent_flags (id, user_id, flag_type, flag_key, title, details)
  SELECT gen_random_uuid(), ts.user_id, 'green', 'auto_a_player',
    ts.full_name || ': A-Player (Top Performer)',
    jsonb_build_object('talent_score', ts.talent_score, 'close_rate', ts.close_rate)
  FROM compute_talent_scores(30) ts
  WHERE ts.talent_score >= 80;

  INSERT INTO talent_flags (id, user_id, flag_type, flag_key, title, details)
  SELECT gen_random_uuid(), ts.user_id, 'green', 'auto_rising',
    ts.full_name || ': Steigender Trend',
    jsonb_build_object('trend_7d', ts.trend_7d)
  FROM compute_talent_scores(30) ts
  WHERE ts.trend_7d > 15 AND ts.talent_score >= 50;
END;
$$;
