
-- ═══════════════════════════════════════════════════════════════
-- TALENT OS™ — Intelligence Layer (Layer 47 · Talent Engine)
-- ═══════════════════════════════════════════════════════════════

-- 1. Talent Flags table
CREATE TABLE IF NOT EXISTS public.talent_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flag_type text NOT NULL CHECK (flag_type IN ('red','green')),
  flag_key text NOT NULL,
  title text NOT NULL,
  details jsonb DEFAULT '{}',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_flags_user ON public.talent_flags(user_id);
CREATE INDEX idx_talent_flags_active ON public.talent_flags(user_id) WHERE resolved_at IS NULL;

ALTER TABLE public.talent_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view talent flags"
  ON public.talent_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage talent flags"
  ON public.talent_flags FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR (SELECT business_stage FROM public.profiles WHERE id = auth.uid()) IN ('partner','director')
  );

-- 2. Talent Actions table
CREATE TABLE IF NOT EXISTS public.talent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('coaching','escalation','promotion','downgrade','reassign','script_review','shadowing','training')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','dismissed')),
  due_date date,
  created_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_actions_user ON public.talent_actions(user_id);
CREATE INDEX idx_talent_actions_pending ON public.talent_actions(user_id) WHERE status = 'pending';

ALTER TABLE public.talent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view talent actions"
  ON public.talent_actions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "L6+ and admins can manage talent actions"
  ON public.talent_actions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR (SELECT business_stage FROM public.profiles WHERE id = auth.uid()) IN ('partner','director','senior_manager')
  );

-- 3. Talent Score Engine — RPC
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
  -- raw metrics
  total_leads int,
  total_bookings int,
  total_shows int,
  total_no_shows int,
  total_closes int,
  total_revenue numeric,
  -- rates
  booking_rate numeric,
  show_rate numeric,
  close_rate numeric,
  revenue_per_lead numeric,
  -- composite
  consistency_score numeric,
  activity_score numeric,
  data_hygiene_score numeric,
  -- final
  talent_score numeric,
  talent_category text,
  talent_trend text,
  -- root cause
  primary_bottleneck text,
  bottleneck_confidence numeric,
  recommended_action text,
  -- meta
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
  -- Leads owned by each operator in range
  lead_counts AS (
    SELECT 
      COALESCE(l.owner_id, l.setter_id, l.closer_id) AS op_id,
      COUNT(*) AS cnt
    FROM leads l
    WHERE l.is_simulation = false
      AND l.created_at >= v_cutoff
      AND NOT public.is_test_lead(l.name, l.email, l.source, l.is_simulation)
    GROUP BY 1
  ),
  -- Appointments in range
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
      AND NOT public.is_test_lead(l.name, l.email, l.source, l.is_simulation)
    GROUP BY 1
  ),
  -- Revenue from calls
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
  -- 14d activity for consistency
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
  -- Active flags
  flag_counts AS (
    SELECT
      tf.user_id AS op_id,
      COUNT(*) FILTER (WHERE tf.flag_type = 'red' AND tf.resolved_at IS NULL) AS reds,
      COUNT(*) FILTER (WHERE tf.flag_type = 'green' AND tf.resolved_at IS NULL) AS greens
    FROM talent_flags tf
    GROUP BY 1
  ),
  -- Combine
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
      -- Rates (avoid /0)
      CASE WHEN COALESCE(lc.cnt,0) > 0 THEN LEAST(100, COALESCE(ast.total_booked,0)::numeric / lc.cnt * 100) ELSE 0 END AS bk_rate,
      CASE WHEN COALESCE(ast.total_booked,0) > 0 THEN LEAST(100, COALESCE(ast.total_showed,0)::numeric / ast.total_booked * 100) ELSE 0 END AS sh_rate,
      CASE WHEN COALESCE(ast.total_showed,0) > 0 THEN LEAST(100, COALESCE(ast.total_closed,0)::numeric / ast.total_showed * 100) ELSE 0 END AS cl_rate,
      CASE WHEN COALESCE(lc.cnt,0) > 0 THEN COALESCE(rs.rev, 0) / lc.cnt ELSE 0 END AS rev_per_lead,
      -- Consistency: 14d rate vs 30d rate (closer to 1 = more consistent)
      CASE 
        WHEN COALESCE(ast.total_booked,0) > 0 AND COALESCE(a14.booked_14d,0) > 0 
        THEN LEAST(100, (COALESCE(a14.booked_14d,0)::numeric / GREATEST(1, ast.total_booked) * 2) * 100)
        WHEN COALESCE(ast.total_booked,0) = 0 AND COALESCE(a14.booked_14d,0) = 0 THEN 50
        ELSE 20
      END AS consist,
      -- Activity: normalized (bookings + shows) / expected (10 per 30d)
      LEAST(100, (COALESCE(ast.total_booked,0) + COALESCE(ast.total_showed,0))::numeric / GREATEST(1, p_range_days / 3) * 100) AS activity,
      -- Data hygiene: leads with owner + lead_status set
      50::numeric AS hygiene, -- baseline, improve later
      -- Flags
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
    f.uid,
    f.fname,
    f.bstage,
    f.lvl,
    f.op_role,
    f.leads_cnt,
    f.bookings_cnt,
    f.shows_cnt,
    f.noshows_cnt,
    f.closes_cnt,
    f.revenue,
    ROUND(f.bk_rate, 1),
    ROUND(f.sh_rate, 1),
    ROUND(f.cl_rate, 1),
    ROUND(f.rev_per_lead, 2),
    ROUND(f.consist, 1),
    ROUND(f.activity, 1),
    ROUND(f.hygiene, 1),
    ROUND(f.tscore, 1),
    CASE
      WHEN f.tscore >= 80 THEN 'A-Player'
      WHEN f.tscore >= 60 THEN 'Stable'
      WHEN f.tscore >= 40 THEN 'Risk'
      ELSE 'Replace'
    END,
    -- Trend (compare 14d consistency to baseline)
    CASE
      WHEN f.consist >= 60 THEN 'up'
      WHEN f.consist <= 30 THEN 'down'
      ELSE 'stable'
    END,
    -- Root cause
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
    f.tenure,
    f.joined,
    f.flag_reds,
    f.flag_greens
  FROM final f
  ORDER BY f.tscore DESC;
END;
$$;

-- 4. Generate Talent Flags — RPC
CREATE OR REPLACE FUNCTION public.generate_talent_flags()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  -- Auto-resolve old flags (older than 30d)
  UPDATE talent_flags SET resolved_at = now() 
  WHERE resolved_at IS NULL AND created_at < now() - interval '30 days';

  -- Iterate scored operators
  FOR r IN SELECT * FROM compute_talent_scores(30) LOOP
    -- RED: No activity
    IF r.total_leads = 0 AND r.total_bookings = 0 THEN
      INSERT INTO talent_flags (user_id, flag_type, flag_key, title, details)
      VALUES (r.user_id, 'red', 'no_activity_14d', 
              r.full_name || ': Keine Aktivität in 30 Tagen',
              jsonb_build_object('score', r.talent_score, 'category', r.talent_category))
      ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;

    -- RED: High no-show rate
    IF r.total_no_shows >= 3 AND r.show_rate < 50 THEN
      INSERT INTO talent_flags (user_id, flag_type, flag_key, title, details)
      VALUES (r.user_id, 'red', 'high_noshow_rate',
              r.full_name || ': ' || r.total_no_shows || ' No-Shows (Show Rate ' || r.show_rate || '%)',
              jsonb_build_object('no_shows', r.total_no_shows, 'show_rate', r.show_rate))
      ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;

    -- RED: Replace category
    IF r.talent_category = 'Replace' THEN
      INSERT INTO talent_flags (user_id, flag_type, flag_key, title, details)
      VALUES (r.user_id, 'red', 'replace_category',
              r.full_name || ': Score ' || r.talent_score || ' — Replace empfohlen',
              jsonb_build_object('score', r.talent_score, 'bottleneck', r.primary_bottleneck))
      ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;

    -- GREEN: A-Player
    IF r.talent_category = 'A-Player' THEN
      INSERT INTO talent_flags (user_id, flag_type, flag_key, title, details)
      VALUES (r.user_id, 'green', 'a_player',
              r.full_name || ': A-Player (Score ' || r.talent_score || ')',
              jsonb_build_object('score', r.talent_score, 'close_rate', r.close_rate))
      ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;

    -- GREEN: Rising trend with decent score
    IF r.talent_trend = 'up' AND r.talent_score >= 50 THEN
      INSERT INTO talent_flags (user_id, flag_type, flag_key, title, details)
      VALUES (r.user_id, 'green', 'rising_trend',
              r.full_name || ': Aufwärtstrend (Score ' || r.talent_score || ')',
              jsonb_build_object('score', r.talent_score, 'trend', r.talent_trend))
      ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
