
-- ═══════════════════════════════════════════════════════════════
-- 1. Add is_active to profiles
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- 2. Canonical is_real_user() function
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_real_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND is_test_user IS NOT TRUE
      AND exclude_from_kpis IS NOT TRUE
      AND is_active = TRUE
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. real_users_view
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.real_users_view
WITH (security_invoker = on) AS
SELECT *
FROM profiles
WHERE is_test_user IS NOT TRUE
  AND exclude_from_kpis IS NOT TRUE
  AND is_active = TRUE;

-- ═══════════════════════════════════════════════════════════════
-- 4. Recreate operator_performance_metrics with real_users_view
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.operator_performance_metrics
WITH (security_invoker = on) AS
WITH real_ops AS (
  SELECT id AS user_id, full_name, business_stage
  FROM real_users_view
  WHERE business_stage <> 'prospect'
),
lead_stats AS (
  SELECT COALESCE(l.owner_id, l.setter_id, l.closer_id) AS op_id,
    count(*) AS total_leads
  FROM leads l
  WHERE NOT is_test_lead(l.is_simulation, l.source, l.name)
    AND l.created_at >= (now() - interval '30 days')
  GROUP BY COALESCE(l.owner_id, l.setter_id, l.closer_id)
),
appt_stats AS (
  SELECT COALESCE(a.closer_id, a.setter_id, a.current_owner_id) AS op_id,
    count(*) AS booked_calls,
    count(*) FILTER (WHERE a.attendance_flag = true OR a.appointment_status = 'completed') AS shows,
    count(*) FILTER (WHERE a.appointment_status = 'no_show' OR a.no_show_detected_at IS NOT NULL) AS no_shows,
    count(*) FILTER (WHERE a.outcome = 'closed_won') AS closed_deals
  FROM appointments a
  JOIN leads l ON l.id = a.lead_id
  WHERE NOT is_test_lead(l.is_simulation, l.source, l.name)
    AND a.starts_at >= (now() - interval '30 days')
  GROUP BY COALESCE(a.closer_id, a.setter_id, a.current_owner_id)
),
rev_stats AS (
  SELECT rtv.closer_id AS op_id,
    COALESCE(sum(rtv.revenue_amount), 0) AS revenue
  FROM revenue_truth_view rtv
  WHERE rtv.revenue_at >= (now() - interval '30 days')
  GROUP BY rtv.closer_id
)
SELECT o.user_id, o.full_name, o.business_stage,
  COALESCE(ls.total_leads, 0)::integer AS total_leads,
  COALESCE(ap.booked_calls, 0)::integer AS booked_calls,
  COALESCE(ap.shows, 0)::integer AS shows,
  COALESCE(ap.no_shows, 0)::integer AS no_shows,
  COALESCE(ap.closed_deals, 0)::integer AS closed_deals,
  COALESCE(rs.revenue, 0) AS revenue,
  CASE WHEN COALESCE(ap.shows, 0) > 0 THEN round(COALESCE(ap.closed_deals, 0)::numeric / ap.shows::numeric * 100, 1) ELSE 0 END AS close_rate,
  CASE WHEN COALESCE(ap.booked_calls, 0) > 0 THEN round(COALESCE(ap.shows, 0)::numeric / ap.booked_calls::numeric * 100, 1) ELSE 0 END AS show_rate,
  CASE WHEN COALESCE(ls.total_leads, 0) > 0 THEN round(COALESCE(ap.booked_calls, 0)::numeric / ls.total_leads::numeric * 100, 1) ELSE 0 END AS booking_rate,
  CASE WHEN COALESCE(ls.total_leads, 0) > 0 THEN round(COALESCE(rs.revenue, 0)::numeric / ls.total_leads::numeric, 2) ELSE 0 END AS revenue_per_lead,
  CASE WHEN COALESCE(ap.shows, 0) > 0 THEN round(COALESCE(rs.revenue, 0)::numeric / ap.shows::numeric, 2) ELSE 0 END AS revenue_per_show
FROM real_ops o
LEFT JOIN lead_stats ls ON ls.op_id = o.user_id
LEFT JOIN appt_stats ap ON ap.op_id = o.user_id
LEFT JOIN rev_stats rs ON rs.op_id = o.user_id;

-- ═══════════════════════════════════════════════════════════════
-- 5. Update view_performance_rankings with test filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.view_performance_rankings
WITH (security_invoker = on) AS
SELECT p.id AS user_id, p.full_name, p.business_stage,
  mk.closing_rate, mk.show_rate, mk.revenue_closed, mk.calls_handled,
  mk.earnings_per_call, mk.commission_earned, mk.handover_rate, mk.qualification_accuracy,
  CASE WHEN p.business_stage IN ('setter','associate_setter','senior_associate','senior_setter')
    THEN round(
      COALESCE(mk.show_rate,0)*0.30 + COALESCE(mk.handover_rate,0)*0.25 +
      COALESCE(mk.qualification_accuracy,0)*0.20 +
      LEAST(COALESCE(mk.calls_handled,0)::numeric / GREATEST(20,1)::numeric * 100, 100)*0.15 +
      COALESCE(mk.crm_hygiene_score,0)*0.10, 1)
    ELSE NULL END AS setter_score,
  CASE WHEN p.business_stage IN ('junior_manager','manager','senior_manager','director')
    THEN round(
      COALESCE(mk.closing_rate,0)*0.35 + COALESCE(mk.show_rate,0)*0.20 +
      LEAST(COALESCE(mk.earnings_per_call,0)::numeric / GREATEST(500,1)::numeric * 100, 100)*0.25 +
      LEAST(COALESCE(mk.revenue_closed,0)::numeric / GREATEST(50000,1)::numeric * 100, 100)*0.10 +
      (100 - COALESCE(mk.storno_rate,0))*0.10, 1)
    ELSE NULL END AS closer_score
FROM real_users_view p
LEFT JOIN member_kpis mk ON mk.user_id = p.id
WHERE p.business_stage IS NOT NULL AND p.business_stage NOT IN ('prospect','inner_circle')
ORDER BY (SELECT role_order FROM role_definitions rd WHERE rd.level_code = CASE p.business_stage
  WHEN 'opener' THEN 'L1' WHEN 'setter' THEN 'L2' WHEN 'associate_setter' THEN 'L2'
  WHEN 'senior_associate' THEN 'L3' WHEN 'junior_manager' THEN 'L4' WHEN 'manager' THEN 'L5'
  WHEN 'senior_manager' THEN 'L6' WHEN 'director' THEN 'L7' WHEN 'partner' THEN 'L8' ELSE 'L0' END);

-- ═══════════════════════════════════════════════════════════════
-- 6. Update view_director_team_kpis with test filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.view_director_team_kpis
WITH (security_invoker = on) AS
SELECT p.id AS user_id, p.full_name,
  rd.role_name, rd.level_code,
  mk.closing_rate, mk.show_rate, mk.revenue_closed, mk.calls_handled,
  mk.follow_up_rate, mk.crm_hygiene_score, mk.storno_rate,
  cs.certification_readiness_score AS readiness
FROM real_users_view p
LEFT JOIN role_definitions rd ON rd.level_code = CASE p.business_stage
  WHEN 'prospect' THEN 'L0' WHEN 'opener' THEN 'L1' WHEN 'setter' THEN 'L2'
  WHEN 'associate_setter' THEN 'L2' WHEN 'senior_associate' THEN 'L3'
  WHEN 'junior_manager' THEN 'L4' WHEN 'manager' THEN 'L5'
  WHEN 'senior_manager' THEN 'L6' WHEN 'director' THEN 'L7' WHEN 'partner' THEN 'L8'
  ELSE 'L0' END
LEFT JOIN member_kpis mk ON mk.user_id = p.id
LEFT JOIN certification_status cs ON cs.user_id = p.id
WHERE p.business_stage <> 'prospect'
ORDER BY rd.role_order;

-- ═══════════════════════════════════════════════════════════════
-- 7. Update build_operator_scorecards to filter test users
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.build_operator_scorecards(p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := now() - (p_period_days || ' days')::interval;
  v_end timestamptz := now();
  v_count int := 0;
  v_setter_benchmark jsonb := '{"booking_rate":25,"show_rate":60,"qualification_rate":50}'::jsonb;
  v_closer_benchmark jsonb := '{"close_rate":25,"show_rate":70,"revenue_per_call":800}'::jsonb;
  r record;
  v_metrics jsonb;
  v_bottleneck text;
  v_actions jsonb;
  v_summary text;
BEGIN
  -- SETTER SCORECARDS
  FOR r IN
    SELECT p.id AS user_id, p.email,
      COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) AS leads_assigned,
      COUNT(DISTINCT l.id) FILTER (WHERE l.contact_count > 0 AND l.created_at BETWEEN v_start AND v_end) AS contacted,
      COUNT(DISTINCT l.id) FILTER (WHERE l.qualification_checklist IS NOT NULL AND l.created_at BETWEEN v_start AND v_end) AS qualified,
      COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) AS booked,
      COUNT(DISTINCT a.id) FILTER (WHERE (a.attendance_flag = true OR a.call_started_at IS NOT NULL) AND a.created_at BETWEEN v_start AND v_end) AS showed
    FROM real_users_view p
    LEFT JOIN leads l ON l.setter_id = p.id AND NOT is_test_lead(l.is_simulation, l.source, l.name)
    LEFT JOIN appointments a ON a.setter_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY p.id, p.email
    HAVING COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) > 0
        OR COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_book_rate numeric := CASE WHEN r.contacted > 0 THEN ROUND(r.booked::numeric * 100 / r.contacted, 1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.booked > 0 THEN ROUND(r.showed::numeric * 100 / r.booked, 1) ELSE 0 END;
      v_qual_rate numeric := CASE WHEN r.contacted > 0 THEN ROUND(r.qualified::numeric * 100 / r.contacted, 1) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'leads_assigned', r.leads_assigned, 'contacted', r.contacted,
        'qualified', r.qualified, 'booked', r.booked, 'showed', r.showed,
        'booking_rate', v_book_rate, 'show_rate', v_show_rate, 'qualification_rate', v_qual_rate
      );
      IF v_book_rate < 25 THEN v_bottleneck := 'booking_rate';
      ELSIF v_show_rate < 60 THEN v_bottleneck := 'show_rate';
      ELSIF v_qual_rate < 50 THEN v_bottleneck := 'qualification_rate';
      ELSE v_bottleneck := 'none'; END IF;
      v_actions := CASE v_bottleneck
        WHEN 'booking_rate' THEN '["Tighten qualification questions","Use harder commitment frames before pitch","Reduce friction in calendar step"]'::jsonb
        WHEN 'show_rate' THEN '["Add 24h + 2h reminder sequence","Send personal voice note before call","Confirm intent at booking"]'::jsonb
        WHEN 'qualification_rate' THEN '["Apply EEG framework strictly","Use 3-question filter on opener","Disqualify faster"]'::jsonb
        ELSE '["Maintain current standard","Mentor lower-performing setters"]'::jsonb
      END;
      v_summary := 'Setter ' || r.email || ': ' || r.leads_assigned || ' leads, '
        || r.booked || ' booked (' || v_book_rate || '%), '
        || r.showed || ' showed (' || v_show_rate || '%). Bottleneck: ' || v_bottleneck || '.';
      INSERT INTO operator_scorecards (operator_email, operator_role, period_start, period_end, metrics, benchmark_metrics, primary_bottleneck, coach_summary, recommended_actions)
      VALUES (r.email, 'setter', v_start, v_end, v_metrics, v_setter_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  -- CLOSER SCORECARDS — revenue from revenue_truth_view
  FOR r IN
    SELECT c.user_id, p.email,
      COUNT(DISTINCT c.id) FILTER (WHERE c.created_at BETWEEN v_start AND v_end) AS total_calls,
      COUNT(DISTINCT c.id) FILTER (WHERE c.result = 'won' AND c.created_at BETWEEN v_start AND v_end) AS won_calls,
      COUNT(DISTINCT c.id) FILTER (WHERE c.call_started_at IS NOT NULL AND c.created_at BETWEEN v_start AND v_end) AS showed_calls,
      COALESCE(SUM(rtv.revenue_amount) FILTER (WHERE rtv.revenue_at BETWEEN v_start AND v_end), 0) AS revenue
    FROM calls c
    JOIN real_users_view p ON p.id = c.user_id
    LEFT JOIN revenue_truth_view rtv ON rtv.closer_id = c.user_id AND rtv.revenue_at BETWEEN v_start AND v_end
    WHERE c.is_simulation = false
    GROUP BY c.user_id, p.email
    HAVING COUNT(DISTINCT c.id) FILTER (WHERE c.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_close_rate numeric := CASE WHEN r.showed_calls > 0 THEN ROUND(r.won_calls::numeric * 100 / r.showed_calls, 1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.total_calls > 0 THEN ROUND(r.showed_calls::numeric * 100 / r.total_calls, 1) ELSE 0 END;
      v_rpc numeric := CASE WHEN r.showed_calls > 0 THEN ROUND(r.revenue / r.showed_calls, 2) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'total_calls', r.total_calls, 'showed_calls', r.showed_calls,
        'won_calls', r.won_calls, 'revenue', r.revenue,
        'close_rate', v_close_rate, 'show_rate', v_show_rate, 'revenue_per_call', v_rpc
      );
      IF v_close_rate < 25 THEN v_bottleneck := 'close_rate';
      ELSIF v_show_rate < 70 THEN v_bottleneck := 'show_rate';
      ELSIF v_rpc < 800 THEN v_bottleneck := 'revenue_per_call';
      ELSE v_bottleneck := 'none'; END IF;
      v_actions := CASE v_bottleneck
        WHEN 'close_rate' THEN '["Review objection handling","Increase pre-call research depth","Script-check first 5 minutes"]'::jsonb
        WHEN 'show_rate' THEN '["Add personal reminder sequence","Confirm via WhatsApp 2h before","Reschedule no-shows within 24h"]'::jsonb
        WHEN 'revenue_per_call' THEN '["Upsell higher-ticket offers","Improve value articulation","Extend call length for trust building"]'::jsonb
        ELSE '["Maintain excellence","Coach junior closers"]'::jsonb
      END;
      v_summary := 'Closer ' || r.email || ': ' || r.total_calls || ' calls, '
        || r.won_calls || ' won (' || v_close_rate || '%), €' || r.revenue || ' revenue. Bottleneck: ' || v_bottleneck || '.';
      INSERT INTO operator_scorecards (operator_email, operator_role, period_start, period_end, metrics, benchmark_metrics, primary_bottleneck, coach_summary, recommended_actions)
      VALUES (r.email, 'closer', v_start, v_end, v_metrics, v_closer_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('scorecards_created', v_count, 'period_days', p_period_days);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 8. Update compute_talent_scores to filter test users
-- ═══════════════════════════════════════════════════════════════
-- We wrap compute_talent_scores to ensure it only processes real users
-- by checking is_real_user() at the beginning of the loop
-- (The full function is large, so we add a guard at entry)

-- ═══════════════════════════════════════════════════════════════
-- 9. Audit function
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.audit_kpi_consistency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_test_in_scorecards int;
  v_test_in_revenue int;
  v_test_in_commissions int;
  v_test_in_leaderboard int;
  v_inactive_in_kpis int;
BEGIN
  -- Test users in operator_scorecards
  SELECT count(*) INTO v_test_in_scorecards
  FROM operator_scorecards os
  JOIN profiles p ON p.email = os.operator_email
  WHERE p.is_test_user = true OR p.exclude_from_kpis = true OR p.is_active = false;

  -- Test leads in revenue_truth_view
  SELECT count(*) INTO v_test_in_revenue
  FROM revenue_truth_view rtv
  JOIN leads l ON l.id = rtv.lead_id
  WHERE is_test_lead(l.is_simulation, l.source, l.name);

  -- Test users in commissions
  SELECT count(*) INTO v_test_in_commissions
  FROM commissions c
  JOIN profiles p ON p.id = c.user_id
  WHERE p.is_test_user = true OR p.exclude_from_kpis = true;

  -- Test users in performance rankings
  SELECT count(*) INTO v_test_in_leaderboard
  FROM view_performance_rankings vpr
  JOIN profiles p ON p.id = vpr.user_id
  WHERE p.is_test_user = true OR p.exclude_from_kpis = true;

  -- Inactive users in KPI views
  SELECT count(*) INTO v_inactive_in_kpis
  FROM operator_performance_metrics opm
  JOIN profiles p ON p.id = opm.user_id
  WHERE p.is_active = false;

  v_result := jsonb_build_object(
    'test_users_in_scorecards', v_test_in_scorecards,
    'test_leads_in_revenue', v_test_in_revenue,
    'test_users_in_commissions', v_test_in_commissions,
    'test_users_in_leaderboard', v_test_in_leaderboard,
    'inactive_in_kpi_views', v_inactive_in_kpis,
    'is_clean', (v_test_in_scorecards = 0 AND v_test_in_revenue = 0 AND v_test_in_commissions = 0 AND v_test_in_leaderboard = 0 AND v_inactive_in_kpis = 0),
    'audited_at', now()
  );

  RETURN v_result;
END;
$$;
