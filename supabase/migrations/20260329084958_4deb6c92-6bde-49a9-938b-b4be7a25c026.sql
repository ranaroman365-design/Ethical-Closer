
-- Credits system
CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own credits" ON public.user_credits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage credits" ON public.user_credits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'usage', 'admin_adjustment', 'bonus')),
  amount integer NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own transactions" ON public.credit_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage transactions" ON public.credit_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Subscriptions
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'none' CHECK (plan IN ('none', 'pro', 'advanced')),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscription" ON public.user_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage subscriptions" ON public.user_subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Leaderboard
CREATE TABLE public.leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  level integer NOT NULL DEFAULT 0,
  weighted_score numeric NOT NULL DEFAULT 0,
  average_score numeric NOT NULL DEFAULT 0,
  best_score numeric NOT NULL DEFAULT 0,
  recent_trend numeric NOT NULL DEFAULT 0,
  total_attempts integer NOT NULL DEFAULT 0,
  realtime_attempts integer NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, level)
);
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read leaderboard" ON public.leaderboard_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "System inserts leaderboard" ON public.leaderboard_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System updates leaderboard" ON public.leaderboard_entries FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Function to deduct credit atomically
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
BEGIN
  SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance <= 0 THEN
    RETURN false;
  END IF;
  UPDATE user_credits SET balance = balance - 1, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'usage', -1, 'Real-Time Simulator session');
  RETURN true;
END;
$$;

-- Function to update leaderboard after simulation attempt
CREATE OR REPLACE FUNCTION public.update_leaderboard_entry(p_user_id uuid, p_level integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg numeric;
  v_best numeric;
  v_trend numeric;
  v_total int;
  v_rt int;
  v_weighted numeric;
  v_recent_scores numeric[];
BEGIN
  -- Get stats from simulation_user_progress
  SELECT COALESCE(avg_score, 0), COALESCE(best_score, 0), COALESCE(total_attempts, 0)
  INTO v_avg, v_best, v_total
  FROM simulation_user_progress
  WHERE user_id = p_user_id AND level = p_level;

  IF v_total IS NULL OR v_total < 1 THEN RETURN; END IF;

  -- Calculate recent trend from last 5 attempts
  SELECT array_agg(total_score ORDER BY created_at DESC)
  INTO v_recent_scores
  FROM (
    SELECT total_score, created_at FROM simulation_attempts
    WHERE user_id = p_user_id AND total_score IS NOT NULL
    ORDER BY created_at DESC LIMIT 5
  ) sub;

  v_trend := 0;
  IF v_recent_scores IS NOT NULL AND array_length(v_recent_scores, 1) >= 2 THEN
    v_trend := v_recent_scores[1] - v_recent_scores[array_length(v_recent_scores, 1)];
  END IF;

  -- Count realtime attempts
  SELECT count(*) INTO v_rt FROM simulation_attempts
  WHERE user_id = p_user_id AND mode = 'realtime';

  -- Weighted score: avg*0.6 + best*0.2 + trend*0.2 + RT bonus
  v_weighted := (v_avg * 0.6) + (v_best * 0.2) + (GREATEST(v_trend, 0) * 0.2);
  IF v_rt > 0 THEN
    v_weighted := v_weighted * 1.2;
  END IF;

  INSERT INTO leaderboard_entries (user_id, level, weighted_score, average_score, best_score, recent_trend, total_attempts, realtime_attempts, last_updated_at)
  VALUES (p_user_id, p_level, ROUND(v_weighted, 2), v_avg, v_best, ROUND(v_trend, 2), v_total, COALESCE(v_rt, 0), now())
  ON CONFLICT (user_id, level) DO UPDATE SET
    weighted_score = EXCLUDED.weighted_score,
    average_score = EXCLUDED.average_score,
    best_score = EXCLUDED.best_score,
    recent_trend = EXCLUDED.recent_trend,
    total_attempts = EXCLUDED.total_attempts,
    realtime_attempts = EXCLUDED.realtime_attempts,
    last_updated_at = now();
END;
$$;
