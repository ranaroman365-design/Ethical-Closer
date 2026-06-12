-- 1. Profile-Erweiterung (additive Spalten, ändern keine bestehende Logik)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credit_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posts_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_answers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_date DATE;

-- 2. Credit-Log
CREATE TABLE IF NOT EXISTS public.user_credit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('post','comment','like_received','login','call','top_answer','kpi','deal','spend','admin_adjust')),
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_credit_log_user_created ON public.user_credit_log(user_id, created_at DESC);

ALTER TABLE public.user_credit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credit log" ON public.user_credit_log;
CREATE POLICY "Users can view their own credit log"
  ON public.user_credit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts laufen ausschliesslich via SECURITY DEFINER Funktion → kein direkter Insert-Policy nötig.

-- 3. Tageslimits
CREATE TABLE IF NOT EXISTS public.credit_daily_caps (
  user_id UUID NOT NULL,
  cap_date DATE NOT NULL,
  posts_counted INTEGER NOT NULL DEFAULT 0,
  comments_counted INTEGER NOT NULL DEFAULT 0,
  login_counted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, cap_date)
);
ALTER TABLE public.credit_daily_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own caps" ON public.credit_daily_caps;
CREATE POLICY "Users can view their own caps"
  ON public.credit_daily_caps FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Level-Up Check
CREATE OR REPLACE FUNCTION public.check_credit_level_up(_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  new_level INTEGER;
BEGIN
  SELECT credit_level, credits_balance, posts_count, comments_count, calls_count, top_answers_count
    INTO p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  new_level := p.credit_level;

  -- L0 → L1
  IF new_level = 0
     AND p.credits_balance >= 50
     AND p.posts_count >= 1
     AND p.comments_count >= 1 THEN
    new_level := 1;
  END IF;
  -- L1 → L2
  IF new_level = 1
     AND p.credits_balance >= 150
     AND p.posts_count >= 3
     AND p.comments_count >= 10
     AND p.calls_count >= 1 THEN
    new_level := 2;
  END IF;
  -- L2 → L3
  IF new_level = 2
     AND p.credits_balance >= 300
     AND p.posts_count >= 5
     AND p.comments_count >= 20
     AND p.calls_count >= 2
     AND p.top_answers_count >= 1 THEN
    new_level := 3;
  END IF;
  -- L3 → L4
  IF new_level = 3
     AND p.credits_balance >= 600
     AND p.posts_count >= 8
     AND p.comments_count >= 30
     AND p.calls_count >= 3 THEN
    new_level := 4;
  END IF;
  -- L4 → L5
  IF new_level = 4
     AND p.credits_balance >= 1200
     AND p.posts_count >= 10
     AND p.comments_count >= 50
     AND p.calls_count >= 5 THEN
    new_level := 5;
  END IF;
  -- L5 → L6
  IF new_level = 5
     AND p.credits_balance >= 2500
     AND p.posts_count >= 15
     AND p.comments_count >= 80
     AND p.calls_count >= 10 THEN
    new_level := 6;
  END IF;

  IF new_level <> p.credit_level THEN
    UPDATE public.profiles SET credit_level = new_level WHERE id = _user_id;
  END IF;
  RETURN new_level;
END;
$$;

-- 5. award_credits — zentraler Eintrittspunkt (server-side, security definer)
CREATE OR REPLACE FUNCTION public.award_credits(
  _type TEXT,
  _reference UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  today DATE := (now() AT TIME ZONE 'utc')::date;
  amt INTEGER := 0;
  caps RECORD;
  awarded BOOLEAN := false;
  new_level INTEGER;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Sicherstellen dass Cap-Zeile existiert
  INSERT INTO public.credit_daily_caps (user_id, cap_date)
    VALUES (uid, today) ON CONFLICT DO NOTHING;
  SELECT * INTO caps FROM public.credit_daily_caps WHERE user_id = uid AND cap_date = today;

  IF _type = 'post' THEN
    IF caps.posts_counted < 5 THEN
      amt := 5;
      UPDATE public.credit_daily_caps SET posts_counted = posts_counted + 1
        WHERE user_id = uid AND cap_date = today;
      UPDATE public.profiles SET posts_count = posts_count + 1 WHERE id = uid;
      awarded := true;
    END IF;

  ELSIF _type = 'comment' THEN
    IF caps.comments_counted < 20 THEN
      amt := 2;
      UPDATE public.credit_daily_caps SET comments_counted = comments_counted + 1
        WHERE user_id = uid AND cap_date = today;
      UPDATE public.profiles SET comments_count = comments_count + 1 WHERE id = uid;
      awarded := true;
    END IF;

  ELSIF _type = 'like_received' THEN
    amt := 1;
    awarded := true;

  ELSIF _type = 'login' THEN
    IF NOT caps.login_counted THEN
      amt := 1;
      UPDATE public.credit_daily_caps SET login_counted = true
        WHERE user_id = uid AND cap_date = today;
      UPDATE public.profiles SET last_login_date = today WHERE id = uid;
      awarded := true;
    END IF;

  ELSIF _type = 'call' THEN
    amt := 15;
    UPDATE public.profiles SET calls_count = calls_count + 1 WHERE id = uid;
    awarded := true;

  ELSIF _type = 'top_answer' THEN
    amt := 10;
    UPDATE public.profiles SET top_answers_count = top_answers_count + 1 WHERE id = uid;
    awarded := true;

  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_type');
  END IF;

  IF NOT awarded THEN
    RETURN jsonb_build_object('ok', true, 'awarded', 0, 'capped', true);
  END IF;

  -- Balance + Log
  UPDATE public.profiles SET credits_balance = credits_balance + amt WHERE id = uid;
  INSERT INTO public.user_credit_log (user_id, amount, type, reference_id, note)
    VALUES (uid, amt, _type, _reference, _note);

  -- Level-Up
  new_level := public.check_credit_level_up(uid);

  RETURN jsonb_build_object('ok', true, 'awarded', amt, 'new_level', new_level);
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_credits(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_credit_level_up(UUID) TO authenticated;