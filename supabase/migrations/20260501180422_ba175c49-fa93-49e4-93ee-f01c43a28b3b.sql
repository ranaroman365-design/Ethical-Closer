
-- ═══════════════════════════════════════════════════════════════
-- TALENT OS™ — Extended Intelligence Layer
-- ═══════════════════════════════════════════════════════════════

-- 1. operator_performance_metrics VIEW (truth from appointments, not stale lead fields)
CREATE OR REPLACE VIEW public.operator_performance_metrics
WITH (security_invoker = on)
AS
WITH real_ops AS (
  SELECT p.id AS user_id, p.full_name, p.business_stage
  FROM profiles p
  WHERE p.business_stage NOT IN ('prospect')
    AND p.full_name NOT ILIKE '%test%'
    AND p.full_name NOT ILIKE '%e2e%'
    AND p.full_name NOT ILIKE '%qa %'
    AND p.full_name NOT ILIKE '%kein lead%'
),
lead_stats AS (
  SELECT
    COALESCE(l.owner_id, l.setter_id, l.closer_id) AS op_id,
    COUNT(*) AS total_leads
  FROM leads l
  WHERE l.is_simulation = false
    AND NOT public.is_test_lead(l.is_simulation, l.name, l.email)
    AND l.created_at >= now() - interval '30 days'
  GROUP BY 1
),
appt_stats AS (
  SELECT
    COALESCE(a.closer_id, a.setter_id, a.current_owner_id) AS op_id,
    COUNT(*) AS booked_calls,
    COUNT(*) FILTER (WHERE a.attendance_flag = true OR a.appointment_status = 'completed') AS shows,
    COUNT(*) FILTER (WHERE a.appointment_status = 'no_show' OR a.no_show_detected_at IS NOT NULL) AS no_shows,
    COUNT(*) FILTER (WHERE a.outcome = 'closed_won') AS closed_deals
  FROM appointments a
  JOIN leads l ON l.id = a.lead_id
  WHERE l.is_simulation = false
    AND NOT public.is_test_lead(l.is_simulation, l.name, l.email)
    AND a.starts_at >= now() - interval '30 days'
  GROUP BY 1
),
rev_stats AS (
  SELECT c.user_id AS op_id, COALESCE(SUM(c.revenue), 0) AS revenue
  FROM calls c
  WHERE c.is_simulation = false AND c.created_at >= now() - interval '30 days' AND c.revenue > 0
  GROUP BY 1
)
SELECT
  o.user_id,
  o.full_name,
  o.business_stage,
  COALESCE(ls.total_leads, 0)::int AS total_leads,
  COALESCE(ap.booked_calls, 0)::int AS booked_calls,
  COALESCE(ap.shows, 0)::int AS shows,
  COALESCE(ap.no_shows, 0)::int AS no_shows,
  COALESCE(ap.closed_deals, 0)::int AS closed_deals,
  COALESCE(rs.revenue, 0)::numeric AS revenue,
  CASE WHEN COALESCE(ap.shows, 0) > 0 THEN ROUND(COALESCE(ap.closed_deals, 0)::numeric / ap.shows * 100, 1) ELSE 0 END AS close_rate,
  CASE WHEN COALESCE(ap.booked_calls, 0) > 0 THEN ROUND(COALESCE(ap.shows, 0)::numeric / ap.booked_calls * 100, 1) ELSE 0 END AS show_rate,
  CASE WHEN COALESCE(ls.total_leads, 0) > 0 THEN ROUND(COALESCE(ap.booked_calls, 0)::numeric / ls.total_leads * 100, 1) ELSE 0 END AS booking_rate,
  CASE WHEN COALESCE(ls.total_leads, 0) > 0 THEN ROUND(COALESCE(rs.revenue, 0) / ls.total_leads, 2) ELSE 0 END AS revenue_per_lead,
  CASE WHEN COALESCE(ap.shows, 0) > 0 THEN ROUND(COALESCE(rs.revenue, 0) / ap.shows, 2) ELSE 0 END AS revenue_per_show
FROM real_ops o
LEFT JOIN lead_stats ls ON ls.op_id = o.user_id
LEFT JOIN appt_stats ap ON ap.op_id = o.user_id
LEFT JOIN rev_stats rs ON rs.op_id = o.user_id;

-- 2. talent_diagnostics table
CREATE TABLE IF NOT EXISTS public.talent_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  primary_issue text NOT NULL,
  confidence_score numeric NOT NULL DEFAULT 50,
  recommended_action text NOT NULL,
  secondary_issues jsonb DEFAULT '[]',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_diagnostics_user ON public.talent_diagnostics(user_id);
CREATE INDEX idx_talent_diagnostics_latest ON public.talent_diagnostics(user_id, computed_at DESC);

ALTER TABLE public.talent_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view diagnostics"
  ON public.talent_diagnostics FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage diagnostics"
  ON public.talent_diagnostics FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR (SELECT business_stage FROM public.profiles WHERE id = auth.uid()) IN ('partner','director','senior_manager')
  );

-- 3. compute_talent_diagnostics() — populates talent_diagnostics
CREATE OR REPLACE FUNCTION public.compute_talent_diagnostics()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN SELECT * FROM compute_talent_scores(30) LOOP
    INSERT INTO talent_diagnostics (user_id, primary_issue, confidence_score, recommended_action, secondary_issues, computed_at)
    VALUES (
      r.user_id,
      r.primary_bottleneck,
      r.bottleneck_confidence,
      r.recommended_action,
      jsonb_build_array(
        jsonb_build_object('metric', 'close_rate', 'value', r.close_rate, 'benchmark', 25),
        jsonb_build_object('metric', 'show_rate', 'value', r.show_rate, 'benchmark', 65),
        jsonb_build_object('metric', 'booking_rate', 'value', r.booking_rate, 'benchmark', 30),
        jsonb_build_object('metric', 'activity', 'value', r.activity_score, 'benchmark', 50)
      ),
      now()
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 4. get_lead_distribution() — score-based lead allocation
CREATE OR REPLACE FUNCTION public.get_lead_distribution()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  talent_score numeric,
  talent_category text,
  lead_pct int,
  recommended_leads_per_week int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.user_id,
    ts.full_name,
    ts.talent_score,
    ts.talent_category,
    CASE
      WHEN ts.talent_category = 'A-Player' THEN 40
      WHEN ts.talent_category = 'Stable' THEN 30
      WHEN ts.talent_category = 'Risk' THEN 20
      ELSE 10
    END::int AS lead_pct,
    CASE
      WHEN ts.talent_category = 'A-Player' THEN 12
      WHEN ts.talent_category = 'Stable' THEN 8
      WHEN ts.talent_category = 'Risk' THEN 5
      ELSE 3
    END::int AS recommended_leads_per_week
  FROM compute_talent_scores(30) ts
  WHERE ts.level_num >= 2  -- Only active setters+
  ORDER BY ts.talent_score DESC;
END;
$$;

-- 5. check_promotion_eligibility() — promotion/downgrade engine
CREATE OR REPLACE FUNCTION public.check_promotion_eligibility()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  level_num int,
  operator_role text,
  talent_score numeric,
  talent_category text,
  promotion_ready boolean,
  downgrade_candidate boolean,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.user_id,
    ts.full_name,
    ts.level_num,
    ts.operator_role,
    ts.talent_score,
    ts.talent_category,
    -- Promotion: Score >= 80, consistent (up/stable), has activity
    (ts.talent_score >= 80 AND ts.talent_trend IN ('up','stable') AND ts.total_bookings >= 3)::boolean AS promo_ready,
    -- Downgrade: Score < 50, no improvement
    (ts.talent_score < 50 AND ts.talent_trend = 'down' AND ts.total_bookings >= 2)::boolean AS down_candidate,
    CASE
      WHEN ts.talent_score >= 80 AND ts.talent_trend IN ('up','stable') AND ts.total_bookings >= 3
        THEN 'Score ' || ts.talent_score || ' ≥ 80, stabil, ' || ts.total_bookings || ' Bookings'
      WHEN ts.talent_score < 50 AND ts.talent_trend = 'down'
        THEN 'Score ' || ts.talent_score || ' < 50, Abwärtstrend, Bottleneck: ' || ts.primary_bottleneck
      WHEN ts.talent_score >= 80 AND ts.total_bookings < 3
        THEN 'Score gut (' || ts.talent_score || '), aber zu wenig Aktivität (' || ts.total_bookings || ' Bookings)'
      ELSE 'Score ' || ts.talent_score || ' — ' || ts.talent_category || ', Trend: ' || ts.talent_trend
    END AS reason
  FROM compute_talent_scores(30) ts
  ORDER BY ts.talent_score DESC;
END;
$$;

-- 6. get_team_ranking() — simple ranking RPC
CREATE OR REPLACE FUNCTION public.get_team_ranking(p_range_days int DEFAULT 30)
RETURNS TABLE(
  rank_pos int,
  user_id uuid,
  full_name text,
  level_num int,
  operator_role text,
  talent_score numeric,
  talent_category text,
  talent_trend text,
  close_rate numeric,
  show_rate numeric,
  total_revenue numeric,
  primary_bottleneck text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY ts.talent_score DESC)::int AS rank_pos,
    ts.user_id, ts.full_name, ts.level_num, ts.operator_role,
    ts.talent_score, ts.talent_category, ts.talent_trend,
    ts.close_rate, ts.show_rate, ts.total_revenue, ts.primary_bottleneck
  FROM compute_talent_scores(p_range_days) ts
  ORDER BY ts.talent_score DESC;
END;
$$;

-- 7. create_talent_action() — L6+ can create actions for team members
CREATE OR REPLACE FUNCTION public.create_talent_action(
  p_user_id uuid,
  p_action_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_stage text;
  v_caller_level int;
  v_action_id uuid;
BEGIN
  -- Check caller level
  SELECT business_stage INTO v_caller_stage FROM profiles WHERE id = auth.uid();
  
  SELECT CASE v_caller_stage
    WHEN 'partner' THEN 8 WHEN 'director' THEN 7 WHEN 'senior_manager' THEN 6
    WHEN 'manager' THEN 5 WHEN 'junior_manager' THEN 4 WHEN 'senior_associate' THEN 3
    WHEN 'setter' THEN 2 WHEN 'opener' THEN 1 ELSE 0
  END INTO v_caller_level;

  IF v_caller_level < 6 AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Insufficient level: L6+ required';
  END IF;

  -- Validate action type
  IF p_action_type NOT IN ('coaching','escalation','promotion','downgrade','reassign','script_review','shadowing','training') THEN
    RAISE EXCEPTION 'Invalid action_type: %', p_action_type;
  END IF;

  INSERT INTO talent_actions (user_id, action_type, title, description, due_date, created_by, status)
  VALUES (p_user_id, p_action_type, p_title, p_description, p_due_date, auth.uid(), 'pending')
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

-- 8. resolve_talent_action() — complete or dismiss
CREATE OR REPLACE FUNCTION public.resolve_talent_action(
  p_action_id uuid,
  p_status text DEFAULT 'completed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('completed','dismissed') THEN
    RAISE EXCEPTION 'Status must be completed or dismissed';
  END IF;

  UPDATE talent_actions
  SET status = p_status, resolved_at = now(), updated_at = now()
  WHERE id = p_action_id
    AND (created_by = auth.uid() OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

  RETURN FOUND;
END;
$$;
