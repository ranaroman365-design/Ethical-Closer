
CREATE OR REPLACE FUNCTION public.evaluate_monetization_state(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_since_signup int;
  v_progress numeric;
  v_calls_done int;
  v_close_rate numeric;
  v_revenue numeric;
  v_activity int;
  v_timebox_pct numeric;
  v_variance numeric;
  v_level int;
  v_new_state text;
  v_old_state text;
  v_mentoring boolean;
BEGIN
  SELECT EXTRACT(DAY FROM (now() - created_at))::int INTO v_days_since_signup
  FROM profiles WHERE id = p_user_id;

  SELECT ROUND(
    count(*) FILTER (WHERE completed = true)::numeric /
    GREATEST(count(*), 1) * 100, 0
  ) INTO v_progress
  FROM member_progress WHERE user_id = p_user_id;

  SELECT COALESCE(calls_handled, 0), COALESCE(closing_rate, 0), COALESCE(revenue_closed, 0)
  INTO v_calls_done, v_close_rate, v_revenue
  FROM member_kpis WHERE user_id = p_user_id;

  v_activity := compute_activity_score(p_user_id);

  SELECT COALESCE(current_level, 0) INTO v_level
  FROM user_level_status WHERE user_id = p_user_id;

  SELECT CASE WHEN timebox_weeks > 0
    THEN LEAST(EXTRACT(EPOCH FROM (now() - level_started_at)) / (timebox_weeks * 604800) * 100, 100)
    ELSE 0 END
  INTO v_timebox_pct
  FROM user_timebox WHERE user_id = p_user_id;

  SELECT COALESCE(STDDEV(closing_rate), 0) INTO v_variance
  FROM (
    SELECT closing_rate FROM kpi_snapshots
    WHERE user_id = p_user_id
    ORDER BY week_start DESC LIMIT 4
  ) sub;

  -- FIXED: use 'active = true' instead of 'status = active'
  SELECT EXISTS(
    SELECT 1 FROM mentor_assignments WHERE mentor_id = p_user_id AND active = true
  ) INTO v_mentoring;

  SELECT current_state INTO v_old_state FROM user_states WHERE user_id = p_user_id;

  IF COALESCE(v_days_since_signup, 0) <= 3 THEN
    v_new_state := 'new';
  ELSIF v_revenue >= 10000 AND v_mentoring AND v_activity >= 70 THEN
    v_new_state := 'leading';
  ELSIF v_revenue >= 5000 AND v_close_rate >= 25 THEN
    IF (SELECT count(*) FROM kpi_snapshots
        WHERE user_id = p_user_id AND closing_rate >= 20
        ORDER BY week_start DESC LIMIT 2) >= 2 THEN
      v_new_state := 'scaling';
    ELSE
      v_new_state := 'performing';
    END IF;
  ELSIF v_close_rate >= (CASE WHEN v_level >= 4 THEN 25 ELSE 20 END)
    AND v_revenue > 0 AND v_activity >= 60 THEN
    v_new_state := 'performing';
  ELSIF COALESCE(v_timebox_pct, 0) >= 80
    AND v_close_rate < (CASE WHEN v_level >= 4 THEN 25 ELSE 20 END)
    AND v_activity < 50 THEN
    v_new_state := 'stuck';
  ELSIF v_variance > 8 THEN
    v_new_state := 'unstable';
  ELSIF COALESCE(v_progress, 0) >= 40 AND v_activity >= 60 AND v_calls_done >= 10 THEN
    v_new_state := 'committed';
  ELSIF COALESCE(v_progress, 0) < 40 AND v_calls_done < 10 AND v_activity >= 40 THEN
    v_new_state := 'learning';
  ELSE
    v_new_state := 'new';
  END IF;

  INSERT INTO user_states (user_id, current_state, previous_state, state_changed_at, activity_score, close_rate_variance, revenue_30d, days_since_signup, progress_pct, updated_at)
  VALUES (p_user_id, v_new_state, v_old_state, 
    CASE WHEN v_old_state IS DISTINCT FROM v_new_state THEN now() 
    ELSE COALESCE((SELECT state_changed_at FROM user_states WHERE user_id = p_user_id), now()) END,
    v_activity, v_variance, v_revenue, v_days_since_signup, COALESCE(v_progress, 0), now())
  ON CONFLICT (user_id) DO UPDATE SET
    current_state = EXCLUDED.current_state,
    previous_state = CASE WHEN user_states.current_state IS DISTINCT FROM EXCLUDED.current_state THEN user_states.current_state ELSE user_states.previous_state END,
    state_changed_at = CASE WHEN user_states.current_state IS DISTINCT FROM EXCLUDED.current_state THEN now() ELSE user_states.state_changed_at END,
    activity_score = EXCLUDED.activity_score,
    close_rate_variance = EXCLUDED.close_rate_variance,
    revenue_30d = EXCLUDED.revenue_30d,
    days_since_signup = EXCLUDED.days_since_signup,
    progress_pct = EXCLUDED.progress_pct,
    updated_at = now();

  IF v_old_state IS DISTINCT FROM v_new_state AND v_old_state IS NOT NULL THEN
    INSERT INTO state_history (user_id, from_state, to_state, reason, metadata)
    VALUES (p_user_id, v_old_state, v_new_state, 'auto_evaluation',
      jsonb_build_object(
        'activity', v_activity, 'close_rate', v_close_rate,
        'revenue', v_revenue, 'variance', v_variance,
        'timebox_pct', v_timebox_pct, 'progress', v_progress
      ));
  END IF;

  RETURN v_new_state;
END;
$$;
