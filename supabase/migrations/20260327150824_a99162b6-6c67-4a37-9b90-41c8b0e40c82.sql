
-- ============================================
-- PERFORMANCE OS EXTENSION — Tables & Functions
-- ============================================

-- 1. call_ai_scores — AI quality scoring per call
CREATE TABLE IF NOT EXISTS public.call_ai_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  
  objection_handling_score numeric DEFAULT 0,
  clarity_score numeric DEFAULT 0,
  trust_score numeric DEFAULT 0,
  structure_score numeric DEFAULT 0,
  ethical_alignment_score numeric DEFAULT 0,
  closing_readiness_score numeric DEFAULT 0,
  
  overall_call_score numeric DEFAULT 0,
  
  scoring_version text DEFAULT 'v1',
  scoring_status text DEFAULT 'scored',
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_call_ai_score UNIQUE (call_id)
);
ALTER TABLE public.call_ai_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI scores" ON public.call_ai_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2. user_level_status — promotion tracking
CREATE TABLE IF NOT EXISTS public.user_level_status (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  current_level integer DEFAULT 0,
  current_role_label text DEFAULT 'Bewerber',
  
  eligible_for_next_level boolean DEFAULT false,
  next_level integer DEFAULT 1,
  
  promotion_status text DEFAULT 'not_eligible',
  
  last_evaluated_at timestamptz DEFAULT now(),
  promoted_at timestamptz
);
ALTER TABLE public.user_level_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own level status" ON public.user_level_status
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can manage level status" ON public.user_level_status
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. promotion_evaluations — audit trail for promotion decisions
CREATE TABLE IF NOT EXISTS public.promotion_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  
  current_level integer NOT NULL,
  target_level integer NOT NULL,
  
  show_rate numeric,
  close_rate numeric,
  earnings_per_call numeric,
  lead_quality_sensitivity numeric,
  ai_call_score_avg numeric,
  
  threshold_passed boolean DEFAULT false,
  evaluation_reason text,
  
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotion_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage promotion evaluations" ON public.promotion_evaluations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own evaluations" ON public.promotion_evaluations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. revenue_forecasts — predictive revenue data
CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid,
  user_id uuid,
  
  forecast_window text NOT NULL DEFAULT '30d',
  expected_bookings numeric DEFAULT 0,
  expected_shows numeric DEFAULT 0,
  expected_closes numeric DEFAULT 0,
  expected_revenue numeric DEFAULT 0,
  
  confidence_level numeric DEFAULT 0,
  model_version text DEFAULT 'v1_simple',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors and admins can view forecasts" ON public.revenue_forecasts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- 5. Enhanced performance score with AI component
CREATE OR REPLACE FUNCTION public.recalc_enhanced_performance(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_booked int; v_showed int; v_won int; v_revenue numeric;
  v_show_rate numeric; v_close_rate numeric; v_epc numeric;
  v_ai_avg numeric; v_team_avg_epc numeric; v_score numeric;
  v_has_ai boolean;
BEGIN
  -- Hard KPIs from calls
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_won, v_revenue
  FROM calls WHERE user_id = p_user_id;

  v_show_rate := CASE WHEN v_booked > 0 THEN LEAST(ROUND((v_showed::numeric / v_booked) * 100, 1), 100) ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0 THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_showed > 0 THEN ROUND(v_revenue / v_showed, 2) ELSE 0 END;

  SELECT COALESCE(AVG(CASE WHEN s.earnings_per_call > 0 THEN s.earnings_per_call END), 1)
  INTO v_team_avg_epc FROM users_kpi_snapshot s;

  -- AI score average (only from valid, non-flagged calls)
  SELECT AVG(cas.overall_call_score), count(*) > 0
  INTO v_ai_avg, v_has_ai
  FROM call_ai_scores cas
  JOIN calls c ON c.id = cas.call_id
  WHERE cas.user_id = p_user_id
    AND cas.scoring_status = 'scored'
    AND c.showed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM data_integrity_logs dil
      WHERE dil.record_id = c.id AND dil.table_name = 'calls'
        AND dil.violation_type NOT IN ('resolved')
    );

  -- Weighted score: if AI available, use 4-factor; otherwise 3-factor
  IF v_has_ai AND v_ai_avg IS NOT NULL THEN
    v_score := ROUND(
      (v_show_rate * 0.25) +
      (v_close_rate * 0.30) +
      (LEAST(v_epc / GREATEST(v_team_avg_epc, 1) * 100, 100) * 0.25) +
      (LEAST(v_ai_avg, 100) * 0.20)
    , 1);
  ELSE
    v_score := ROUND(
      (v_show_rate * 0.3125) +
      (v_close_rate * 0.375) +
      (LEAST(v_epc / GREATEST(v_team_avg_epc, 1) * 100, 100) * 0.3125)
    , 1);
  END IF;

  -- Upsert snapshot
  INSERT INTO users_kpi_snapshot (user_id, show_rate, close_rate, earnings_per_call, performance_score, total_calls, total_revenue, last_updated)
  VALUES (p_user_id, v_show_rate, v_close_rate, v_epc, v_score, v_booked, v_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    show_rate = EXCLUDED.show_rate, close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call, performance_score = EXCLUDED.performance_score,
    total_calls = EXCLUDED.total_calls, total_revenue = EXCLUDED.total_revenue, last_updated = now();

  -- Sync member_kpis
  INSERT INTO member_kpis (user_id, closing_rate, show_rate, revenue_closed, calls_handled, earnings_per_call, updated_at)
  VALUES (p_user_id, v_close_rate, v_show_rate, v_revenue, v_booked, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate, show_rate = EXCLUDED.show_rate,
    revenue_closed = EXCLUDED.revenue_closed, calls_handled = EXCLUDED.calls_handled,
    earnings_per_call = EXCLUDED.earnings_per_call, updated_at = now();
END;
$$;

-- 6. Promotion evaluation function
CREATE OR REPLACE FUNCTION public.evaluate_user_for_promotion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_current_level int;
  v_target_level int;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
  v_ai_avg numeric;
  v_calls int;
  v_passed boolean := false;
  v_reason text;
  v_role_label text;
  v_onboarding boolean;
  v_certified boolean;
  v_modules_done int;
  v_has_integrity_issues boolean;
BEGIN
  -- Check for unresolved integrity issues
  SELECT EXISTS (
    SELECT 1 FROM data_integrity_logs
    WHERE record_id IN (SELECT id::text FROM calls WHERE user_id = p_user_id)
      AND violation_type NOT IN ('resolved', 'ignored_with_reason')
  ) INTO v_has_integrity_issues;

  -- Get current level
  SELECT COALESCE(uls.current_level, 0) INTO v_current_level
  FROM user_level_status uls WHERE uls.user_id = p_user_id;

  IF v_current_level IS NULL THEN
    v_current_level := 0;
    INSERT INTO user_level_status (user_id, current_level, current_role_label)
    VALUES (p_user_id, 0, 'Bewerber')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  v_target_level := v_current_level + 1;

  -- Get KPIs from snapshot
  SELECT s.show_rate, s.close_rate, s.earnings_per_call, s.total_calls
  INTO v_show_rate, v_close_rate, v_epc, v_calls
  FROM users_kpi_snapshot s WHERE s.user_id = p_user_id;

  v_show_rate := COALESCE(v_show_rate, 0);
  v_close_rate := COALESCE(v_close_rate, 0);
  v_epc := COALESCE(v_epc, 0);
  v_calls := COALESCE(v_calls, 0);

  -- AI score average
  SELECT COALESCE(AVG(overall_call_score), 0)
  INTO v_ai_avg
  FROM call_ai_scores WHERE user_id = p_user_id AND scoring_status = 'scored';

  -- Profile data
  SELECT onboarding_completed, certified INTO v_onboarding, v_certified
  FROM profiles WHERE id = p_user_id;

  SELECT count(*) INTO v_modules_done
  FROM member_progress WHERE user_id = p_user_id AND completed = true;

  -- Block if integrity issues
  IF v_has_integrity_issues THEN
    v_reason := 'Unresolved data integrity issues — promotion blocked';
    v_passed := false;
  ELSE
    -- Level-specific thresholds
    CASE v_target_level
      WHEN 1 THEN -- L0 → L1 Trainee
        v_passed := COALESCE(v_onboarding, false);
        v_reason := CASE WHEN v_passed THEN 'Onboarding completed' ELSE 'Onboarding not completed' END;
        v_role_label := 'Trainee';

      WHEN 2 THEN -- L1 → L2 Associate Setter
        v_passed := v_modules_done >= 3 AND v_calls >= 5;
        v_reason := format('Modules: %s/3, Calls: %s/5', v_modules_done, v_calls);
        v_role_label := 'Associate Setter';

      WHEN 3 THEN -- L2 → L3 Senior Setter
        v_passed := v_show_rate >= 60 AND v_calls >= 20 AND COALESCE(v_certified, false);
        v_reason := format('Show: %s%%/60%%, Calls: %s/20, Cert: %s', v_show_rate, v_calls, v_certified);
        v_role_label := 'Senior Setter';

      WHEN 4 THEN -- L3 → L4 Junior Closer
        v_passed := v_show_rate >= 70 AND v_close_rate >= 15 AND v_calls >= 40;
        v_reason := format('Show: %s%%/70%%, Close: %s%%/15%%, Calls: %s/40', v_show_rate, v_close_rate, v_calls);
        v_role_label := 'Junior Closer';

      WHEN 5 THEN -- L4 → L5 Managing Closer (Placement Ready)
        v_passed := v_close_rate >= 25 AND v_show_rate >= 75 AND v_epc >= 200 AND v_calls >= 80;
        v_reason := format('Close: %s%%/25%%, Show: %s%%/75%%, EPC: %s/200, Calls: %s/80', v_close_rate, v_show_rate, v_epc, v_calls);
        v_role_label := 'Managing Closer';

      WHEN 6 THEN -- L5 → L6 Senior Closer
        v_passed := v_close_rate >= 30 AND v_epc >= 400 AND v_calls >= 150;
        v_reason := format('Close: %s%%/30%%, EPC: %s/400, Calls: %s/150', v_close_rate, v_epc, v_calls);
        v_role_label := 'Senior Closer';

      WHEN 7 THEN -- L6 → L7 Director (manual review required)
        v_passed := false;
        v_reason := 'Director promotion requires manual review';
        v_role_label := 'Director';

      WHEN 8 THEN -- L7 → L8 Partner (invitation only)
        v_passed := false;
        v_reason := 'Partner status is invitation-only';
        v_role_label := 'Partner';

      ELSE
        v_passed := false;
        v_reason := 'Max level reached or invalid target';
        v_role_label := 'Admin';
    END CASE;
  END IF;

  -- Log evaluation
  INSERT INTO promotion_evaluations (user_id, current_level, target_level, show_rate, close_rate, earnings_per_call, ai_call_score_avg, threshold_passed, evaluation_reason)
  VALUES (p_user_id, v_current_level, v_target_level, v_show_rate, v_close_rate, v_epc, v_ai_avg, v_passed, v_reason);

  -- Update user_level_status
  UPDATE user_level_status SET
    eligible_for_next_level = v_passed,
    next_level = v_target_level,
    promotion_status = CASE
      WHEN v_passed AND v_target_level <= 6 THEN 'eligible'
      WHEN v_passed AND v_target_level > 6 THEN 'pending_review'
      ELSE 'not_eligible'
    END,
    last_evaluated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_level_status (user_id, current_level, current_role_label, eligible_for_next_level, next_level, promotion_status, last_evaluated_at)
    VALUES (p_user_id, v_current_level, COALESCE(v_role_label, 'Bewerber'), v_passed, v_target_level,
      CASE WHEN v_passed AND v_target_level <= 6 THEN 'eligible' WHEN v_passed THEN 'pending_review' ELSE 'not_eligible' END, now());
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'current_level', v_current_level,
    'target_level', v_target_level,
    'passed', v_passed,
    'reason', v_reason,
    'show_rate', v_show_rate,
    'close_rate', v_close_rate,
    'epc', v_epc,
    'ai_avg', v_ai_avg,
    'integrity_issues', v_has_integrity_issues
  );
END;
$$;

-- 7. Promote user function (separate from evaluation)
CREATE OR REPLACE FUNCTION public.promote_user(p_user_id uuid, p_admin_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_status record;
  v_new_label text;
  v_new_stage text;
BEGIN
  SELECT * INTO v_status FROM user_level_status WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User level status not found');
  END IF;

  IF v_status.promotion_status NOT IN ('eligible', 'pending_review') THEN
    RETURN jsonb_build_object('error', 'User is not eligible for promotion');
  END IF;

  -- Map level to role label and business_stage
  CASE v_status.next_level
    WHEN 1 THEN v_new_label := 'Trainee'; v_new_stage := 'trainee';
    WHEN 2 THEN v_new_label := 'Associate Setter'; v_new_stage := 'associate';
    WHEN 3 THEN v_new_label := 'Senior Setter'; v_new_stage := 'senior_associate';
    WHEN 4 THEN v_new_label := 'Junior Closer'; v_new_stage := 'junior_manager';
    WHEN 5 THEN v_new_label := 'Managing Closer'; v_new_stage := 'manager';
    WHEN 6 THEN v_new_label := 'Senior Closer'; v_new_stage := 'senior_manager';
    WHEN 7 THEN v_new_label := 'Director'; v_new_stage := 'director';
    WHEN 8 THEN v_new_label := 'Partner'; v_new_stage := 'partner';
    ELSE v_new_label := 'Unknown'; v_new_stage := 'trainee';
  END CASE;

  -- Update level status
  UPDATE user_level_status SET
    current_level = v_status.next_level,
    current_role_label = v_new_label,
    eligible_for_next_level = false,
    next_level = v_status.next_level + 1,
    promotion_status = 'promoted',
    promoted_at = now()
  WHERE user_id = p_user_id;

  -- Update profile
  UPDATE profiles SET
    business_stage = v_new_stage,
    updated_at = now()
  WHERE id = p_user_id;

  -- Audit log
  INSERT INTO audit_logs (action, actor_id, source_type, note, before_state, after_state)
  VALUES (
    'user_promoted',
    COALESCE(p_admin_id, p_user_id),
    CASE WHEN p_admin_id IS NOT NULL THEN 'admin' ELSE 'system' END,
    format('User promoted from L%s to L%s (%s)', v_status.current_level, v_status.next_level, v_new_label),
    jsonb_build_object('level', v_status.current_level, 'role', v_status.current_role_label),
    jsonb_build_object('level', v_status.next_level, 'role', v_new_label)
  );

  RETURN jsonb_build_object('success', true, 'new_level', v_status.next_level, 'role', v_new_label);
END;
$$;

-- 8. Revenue forecast function
CREATE OR REPLACE FUNCTION public.generate_revenue_forecast(
  p_pipeline_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_window text DEFAULT '30d'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_days int;
  v_avg_bookings_per_day numeric;
  v_rolling_show_rate numeric;
  v_rolling_close_rate numeric;
  v_avg_revenue_per_win numeric;
  v_expected_bookings numeric;
  v_expected_shows numeric;
  v_expected_closes numeric;
  v_expected_revenue numeric;
  v_confidence numeric;
  v_call_count int;
  v_forecast_id uuid;
  v_stddev_close numeric;
BEGIN
  v_days := CASE p_window
    WHEN '7d' THEN 7
    WHEN '30d' THEN 30
    WHEN 'current_month' THEN (date_trunc('month', now()) + interval '1 month' - now())::int
    WHEN 'next_month' THEN (date_trunc('month', now() + interval '1 month') + interval '1 month' - date_trunc('month', now() + interval '1 month'))::int
    ELSE 30
  END;

  -- Historical data (last 90 days, only verified)
  WITH recent AS (
    SELECT * FROM calls
    WHERE created_at >= now() - interval '90 days'
      AND (p_pipeline_id IS NULL OR pipeline_id = p_pipeline_id)
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND id NOT IN (
        SELECT record_id::uuid FROM data_integrity_logs
        WHERE table_name = 'calls' AND violation_type NOT IN ('resolved', 'ignored_with_reason')
        AND record_id IS NOT NULL
      )
  )
  SELECT
    count(*),
    COALESCE(count(*) FILTER (WHERE booked_at IS NOT NULL)::numeric / GREATEST(90, 1), 0),
    CASE WHEN count(*) FILTER (WHERE booked_at IS NOT NULL) > 0
      THEN LEAST(count(*) FILTER (WHERE showed_at IS NOT NULL)::numeric / count(*) FILTER (WHERE booked_at IS NOT NULL), 1)
      ELSE 0 END,
    CASE WHEN count(*) FILTER (WHERE showed_at IS NOT NULL) > 0
      THEN LEAST(count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won')::numeric / count(*) FILTER (WHERE showed_at IS NOT NULL), 1)
      ELSE 0 END,
    COALESCE(AVG(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) END), 0),
    COALESCE(STDDEV(CASE WHEN showed_at IS NOT NULL THEN (CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN 1 ELSE 0 END)::numeric END), 1)
  INTO v_call_count, v_avg_bookings_per_day, v_rolling_show_rate, v_rolling_close_rate, v_avg_revenue_per_win, v_stddev_close
  FROM recent;

  v_expected_bookings := ROUND(v_avg_bookings_per_day * v_days, 1);
  v_expected_shows := ROUND(v_expected_bookings * v_rolling_show_rate, 1);
  v_expected_closes := ROUND(v_expected_shows * v_rolling_close_rate, 1);
  v_expected_revenue := ROUND(v_expected_closes * v_avg_revenue_per_win, 2);

  -- Confidence: based on data volume + stability
  v_confidence := LEAST(
    ROUND(
      (LEAST(v_call_count::numeric / 50, 1) * 50) +  -- volume factor
      (GREATEST(1 - v_stddev_close, 0) * 30) +        -- stability factor
      (CASE WHEN v_call_count >= 10 THEN 20 ELSE v_call_count * 2 END)  -- min data
    , 1)
  , 100);

  INSERT INTO revenue_forecasts (pipeline_id, user_id, forecast_window, expected_bookings, expected_shows, expected_closes, expected_revenue, confidence_level, model_version)
  VALUES (p_pipeline_id, p_user_id, p_window, v_expected_bookings, v_expected_shows, v_expected_closes, v_expected_revenue, v_confidence, 'v1_simple')
  RETURNING id INTO v_forecast_id;

  RETURN v_forecast_id;
END;
$$;

-- 9. Initialize user_level_status for existing users
INSERT INTO user_level_status (user_id, current_level, current_role_label)
SELECT p.id,
  CASE p.business_stage
    WHEN 'trainee' THEN 1
    WHEN 'associate' THEN 2
    WHEN 'senior_associate' THEN 3
    WHEN 'junior_manager' THEN 4
    WHEN 'manager' THEN 5
    WHEN 'senior_manager' THEN 6
    WHEN 'director' THEN 7
    WHEN 'partner' THEN 8
    ELSE 0
  END,
  CASE p.business_stage
    WHEN 'trainee' THEN 'Trainee'
    WHEN 'associate' THEN 'Associate Setter'
    WHEN 'senior_associate' THEN 'Senior Setter'
    WHEN 'junior_manager' THEN 'Junior Closer'
    WHEN 'manager' THEN 'Managing Closer'
    WHEN 'senior_manager' THEN 'Senior Closer'
    WHEN 'director' THEN 'Director'
    WHEN 'partner' THEN 'Partner'
    ELSE 'Bewerber'
  END
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM user_level_status uls WHERE uls.user_id = p.id);
