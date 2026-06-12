-- 7-Day Onboarding Track table
CREATE TABLE IF NOT EXISTS public.onboarding_tracks (
  user_id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  current_day INT NOT NULL DEFAULT 1,
  completed_days INT[] NOT NULL DEFAULT ARRAY[]::INT[],
  last_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT current_day_range CHECK (current_day BETWEEN 1 AND 8)
);

ALTER TABLE public.onboarding_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own onboarding track"
  ON public.onboarding_tracks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own onboarding track"
  ON public.onboarding_tracks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own onboarding track"
  ON public.onboarding_tracks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all onboarding tracks"
  ON public.onboarding_tracks FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER trg_onboarding_tracks_updated_at
  BEFORE UPDATE ON public.onboarding_tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic complete-day function: marks day done, awards credits, advances current_day.
CREATE OR REPLACE FUNCTION public.complete_onboarding_day(_day INT, _credits INT)
RETURNS public.onboarding_tracks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_track public.onboarding_tracks;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _day < 1 OR _day > 7 THEN
    RAISE EXCEPTION 'invalid day %', _day;
  END IF;

  INSERT INTO public.onboarding_tracks (user_id)
  VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_track FROM public.onboarding_tracks WHERE user_id = v_user;

  IF _day = ANY(v_track.completed_days) THEN
    RETURN v_track;
  END IF;

  UPDATE public.onboarding_tracks
     SET completed_days     = array_append(completed_days, _day),
         current_day        = LEAST(GREATEST(current_day, _day + 1), 8),
         last_completed_at  = now(),
         completed_at       = CASE WHEN array_length(array_append(completed_days, _day), 1) >= 7
                                   THEN now() ELSE completed_at END
   WHERE user_id = v_user
   RETURNING * INTO v_track;

  IF _credits > 0 THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (v_user, _credits, 'onboarding_reward',
            'Onboarding Day ' || _day || ' completed');
  END IF;

  RETURN v_track;
END;
$$;