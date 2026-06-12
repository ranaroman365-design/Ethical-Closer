
-- 1. Fix compute_talent_scores: rl.full_name → rl.name
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
      AND rl.name NOT ILIKE 'test%'
      AND rl.name NOT ILIKE '%kein lead%'
      AND rl.name NOT ILIKE '%test test%'
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

-- 2. Fix route_lead_to_unit — use pre-computed scores instead of calling compute_talent_scores
CREATE OR REPLACE FUNCTION public.route_lead_to_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit record;
  v_funnel text;
  v_member record;
  v_dist_mode text;
  v_total_score numeric;
  v_rand numeric;
  v_cumulative numeric;
BEGIN
  v_funnel := CASE
    WHEN NEW.source ILIKE '%apply%'            THEN '/apply'
    WHEN NEW.source ILIKE '%qualify%'           THEN '/qualify'
    WHEN NEW.source ILIKE '%high-income%'
      OR NEW.source ILIKE '%his%'              THEN '/high-income-skill'
    WHEN NEW.source ILIKE '%partner%'           THEN '/partners'
    ELSE NULL
  END;

  IF v_funnel IS NOT NULL THEN
    SELECT id, operator_id INTO v_unit
    FROM operator_units
    WHERE funnel_path = v_funnel AND status = 'active'
    LIMIT 1;

    IF v_unit.id IS NOT NULL THEN
      NEW.unit_id := v_unit.id;

      -- Get distribution mode
      SELECT COALESCE(dc.mode, 'talent_score') INTO v_dist_mode
      FROM lead_distribution_config dc WHERE dc.unit_id = v_unit.id;

      IF v_dist_mode IS NULL THEN
        v_dist_mode := 'talent_score';
      END IF;

      IF v_dist_mode = 'talent_score' THEN
        -- Use pre-computed talent_diagnostics scores (lightweight lookup)
        SELECT COALESCE(SUM(td.confidence_score), 0) INTO v_total_score
        FROM operator_team_members otm
        LEFT JOIN talent_diagnostics td ON td.user_id = otm.member_id
        WHERE otm.unit_id = v_unit.id;

        IF v_total_score > 0 THEN
          v_rand := random() * v_total_score;
          v_cumulative := 0;

          FOR v_member IN
            SELECT otm.member_id, COALESCE(td.confidence_score, 10) AS tscore
            FROM operator_team_members otm
            LEFT JOIN talent_diagnostics td ON td.user_id = otm.member_id
            WHERE otm.unit_id = v_unit.id
            ORDER BY COALESCE(td.confidence_score, 10) DESC
          LOOP
            v_cumulative := v_cumulative + v_member.tscore;
            IF v_cumulative >= v_rand THEN
              NEW.assigned_operator_id := v_member.member_id;
              BEGIN
                INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
                VALUES (NEW.id, v_unit.id, v_member.member_id, v_member.tscore,
                        ROUND(v_member.tscore / GREATEST(v_total_score, 1) * 100, 1), 'talent_weighted');
              EXCEPTION WHEN OTHERS THEN NULL;
              END;
              EXIT;
            END IF;
          END LOOP;
        ELSE
          -- No scores yet: pick member with fewest leads (equal fallback)
          SELECT otm.member_id INTO v_member
          FROM operator_team_members otm
          LEFT JOIN (
            SELECT assigned_operator_id, COUNT(*) AS cnt
            FROM leads WHERE created_at >= now() - interval '7 days'
            GROUP BY 1
          ) lc ON lc.assigned_operator_id = otm.member_id
          WHERE otm.unit_id = v_unit.id
          ORDER BY COALESCE(lc.cnt, 0), random()
          LIMIT 1;

          IF v_member IS NOT NULL THEN
            NEW.assigned_operator_id := v_member.member_id;
            BEGIN
              INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
              VALUES (NEW.id, v_unit.id, v_member.member_id, 0, 0, 'equal_fallback');
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
        END IF;

      ELSIF v_dist_mode = 'equal' THEN
        SELECT otm.member_id INTO v_member
        FROM operator_team_members otm
        LEFT JOIN (
          SELECT assigned_operator_id, COUNT(*) AS cnt
          FROM leads WHERE created_at >= now() - interval '7 days'
          GROUP BY 1
        ) lc ON lc.assigned_operator_id = otm.member_id
        WHERE otm.unit_id = v_unit.id
        ORDER BY COALESCE(lc.cnt, 0), random()
        LIMIT 1;

        IF v_member IS NOT NULL THEN
          NEW.assigned_operator_id := v_member.member_id;
          BEGIN
            INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
            VALUES (NEW.id, v_unit.id, v_member.member_id, 0, 0, 'equal');
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;
      END IF;

      -- Fallback: operator owns the lead
      IF NEW.assigned_operator_id IS NULL THEN
        NEW.assigned_operator_id := v_unit.operator_id;
        BEGIN
          INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
          VALUES (NEW.id, v_unit.id, v_unit.operator_id, 0, 0, 'fallback_operator');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
