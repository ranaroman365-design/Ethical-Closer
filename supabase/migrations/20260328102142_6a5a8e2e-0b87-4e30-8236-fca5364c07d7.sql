
-- User activity tracking for monetization state engine
CREATE TABLE public.user_activity (
  user_id uuid PRIMARY KEY,
  login_count int NOT NULL DEFAULT 0,
  posts_count int NOT NULL DEFAULT 0,
  replies_count int NOT NULL DEFAULT 0,
  calls_done int NOT NULL DEFAULT 0,
  kpi_updates int NOT NULL DEFAULT 0,
  weekly_score int NOT NULL DEFAULT 0,
  week_start date NOT NULL DEFAULT date_trunc('week', now())::date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own activity" ON public.user_activity
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins read all activity" ON public.user_activity
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add activity_score and variance columns to user_states
ALTER TABLE public.user_states
  ADD COLUMN IF NOT EXISTS activity_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close_rate_variance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_30d numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_since_signup int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_pct numeric DEFAULT 0;

-- Trigger log for offer display tracking (supplements offer_impressions)
CREATE TABLE public.trigger_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger_type text NOT NULL,
  offer_key text,
  shown_at timestamptz NOT NULL DEFAULT now(),
  accepted boolean DEFAULT false,
  accepted_at timestamptz,
  context text DEFAULT 'dashboard'
);

ALTER TABLE public.trigger_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own triggers" ON public.trigger_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own triggers" ON public.trigger_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read all triggers" ON public.trigger_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Function to compute activity score
CREATE OR REPLACE FUNCTION public.compute_activity_score(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_logins int;
  v_posts int;
  v_replies int;
  v_calls int;
  v_kpi_updates int;
  v_score int;
  v_week_start date := date_trunc('week', now())::date;
BEGIN
  -- Count logins (from audit_logs as proxy)
  SELECT count(*) INTO v_logins
  FROM audit_logs
  WHERE actor_id = p_user_id AND action = 'login'
    AND created_at >= v_week_start;

  -- Count community posts
  SELECT count(*) INTO v_posts
  FROM community_messages
  WHERE user_id = p_user_id AND reply_to IS NULL
    AND created_at >= v_week_start;

  -- Count community replies
  SELECT count(*) INTO v_replies
  FROM community_messages
  WHERE user_id = p_user_id AND reply_to IS NOT NULL
    AND created_at >= v_week_start;

  -- Count calls done
  SELECT count(*) INTO v_calls
  FROM calls
  WHERE user_id = p_user_id AND showed_at IS NOT NULL
    AND created_at >= v_week_start;

  -- KPI updates (member_kpis updated this week)
  SELECT CASE WHEN updated_at >= v_week_start THEN 1 ELSE 0 END INTO v_kpi_updates
  FROM member_kpis WHERE user_id = p_user_id;

  v_score := LEAST(
    (COALESCE(v_logins, 0) * 5) +
    (COALESCE(v_posts, 0) * 10) +
    (COALESCE(v_replies, 0) * 5) +
    (COALESCE(v_calls, 0) * 15) +
    (COALESCE(v_kpi_updates, 0) * 10),
    100
  );

  -- Upsert activity
  INSERT INTO user_activity (user_id, login_count, posts_count, replies_count, calls_done, kpi_updates, weekly_score, week_start, updated_at)
  VALUES (p_user_id, COALESCE(v_logins,0), COALESCE(v_posts,0), COALESCE(v_replies,0), COALESCE(v_calls,0), COALESCE(v_kpi_updates,0), v_score, v_week_start, now())
  ON CONFLICT (user_id) DO UPDATE SET
    login_count = EXCLUDED.login_count,
    posts_count = EXCLUDED.posts_count,
    replies_count = EXCLUDED.replies_count,
    calls_done = EXCLUDED.calls_done,
    kpi_updates = EXCLUDED.kpi_updates,
    weekly_score = EXCLUDED.weekly_score,
    week_start = EXCLUDED.week_start,
    updated_at = now();

  RETURN v_score;
END;
$$;

-- Function to evaluate user state with exact numeric thresholds
CREATE OR REPLACE FUNCTION public.evaluate_monetization_state(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  -- Days since signup
  SELECT EXTRACT(DAY FROM (now() - created_at))::int INTO v_days_since_signup
  FROM profiles WHERE id = p_user_id;

  -- Progress (modules completed / total)
  SELECT ROUND(
    count(*) FILTER (WHERE completed = true)::numeric /
    GREATEST(count(*), 1) * 100, 0
  ) INTO v_progress
  FROM member_progress WHERE user_id = p_user_id;

  -- KPIs
  SELECT COALESCE(calls_handled, 0), COALESCE(closing_rate, 0), COALESCE(revenue_closed, 0)
  INTO v_calls_done, v_close_rate, v_revenue
  FROM member_kpis WHERE user_id = p_user_id;

  -- Activity score
  v_activity := compute_activity_score(p_user_id);

  -- Level
  SELECT COALESCE(current_level, 0) INTO v_level
  FROM user_level_status WHERE user_id = p_user_id;

  -- Timebox progress
  SELECT CASE WHEN timebox_weeks > 0
    THEN LEAST(EXTRACT(EPOCH FROM (now() - level_started_at)) / (timebox_weeks * 604800) * 100, 100)
    ELSE 0 END
  INTO v_timebox_pct
  FROM user_timebox WHERE user_id = p_user_id;

  -- Close rate variance (from last 4 weekly snapshots)
  SELECT COALESCE(STDDEV(closing_rate), 0) INTO v_variance
  FROM (
    SELECT closing_rate FROM kpi_snapshots
    WHERE user_id = p_user_id
    ORDER BY week_start DESC LIMIT 4
  ) sub;

  -- Mentoring check
  SELECT EXISTS(
    SELECT 1 FROM mentor_assignments WHERE mentor_id = p_user_id AND status = 'active'
  ) INTO v_mentoring;

  -- Get current state
  SELECT current_state INTO v_old_state FROM user_states WHERE user_id = p_user_id;

  -- ══════════════════════════════════════
  -- STATE DECISION TREE (exact thresholds)
  -- ══════════════════════════════════════

  IF COALESCE(v_days_since_signup, 0) <= 3 THEN
    v_new_state := 'new';

  ELSIF v_revenue >= 10000 AND v_mentoring AND v_activity >= 70 THEN
    v_new_state := 'leading';

  ELSIF v_revenue >= 5000 AND v_close_rate >= 25 THEN
    -- Check 2-week consistency via snapshots
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

  -- Upsert user_states
  INSERT INTO user_states (user_id, current_state, previous_state, state_changed_at, activity_score, close_rate_variance, revenue_30d, days_since_signup, progress_pct, updated_at)
  VALUES (p_user_id, v_new_state, v_old_state, CASE WHEN v_old_state IS DISTINCT FROM v_new_state THEN now() ELSE COALESCE((SELECT state_changed_at FROM user_states WHERE user_id = p_user_id), now()) END,
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

  -- Log state change
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
