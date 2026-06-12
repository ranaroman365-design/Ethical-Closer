
-- Trainers table
CREATE TABLE public.trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  profile_image text,
  specialties text[] NOT NULL DEFAULT '{}',
  levels_supported int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6,7,8}',
  formats text[] NOT NULL DEFAULT '{1:1}',
  languages text[] NOT NULL DEFAULT '{de}',
  primary_focus text,
  secondary_focus text,
  intensity_level text NOT NULL DEFAULT 'medium',
  coaching_style text NOT NULL DEFAULT 'structured',
  pricing_intro_call numeric DEFAULT 0,
  pricing_packages jsonb DEFAULT '[]'::jsonb,
  is_approved boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

-- Everyone can view approved trainers
CREATE POLICY "Anyone can view approved trainers"
  ON public.trainers FOR SELECT
  TO authenticated
  USING (is_approved = true);

-- Admins can manage all trainers
CREATE POLICY "Admins manage trainers"
  ON public.trainers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trainer matches table
CREATE TABLE public.trainer_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainer_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own matches"
  ON public.trainer_matches FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage matches"
  ON public.trainer_matches FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trainer requests table
CREATE TABLE public.trainer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own requests"
  ON public.trainer_requests FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage all requests"
  ON public.trainer_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trainers can see requests for them
CREATE POLICY "Trainers see their requests"
  ON public.trainer_requests FOR SELECT
  TO authenticated
  USING (trainer_id IN (SELECT id FROM public.trainers WHERE user_id = auth.uid()));

-- Matching function
CREATE OR REPLACE FUNCTION public.generate_trainer_matches(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_level int;
  v_goal text;
  v_capacity text;
  v_trainer record;
  v_score numeric;
  v_reason text;
  v_matches jsonb := '[]'::jsonb;
  v_count int := 0;
BEGIN
  -- Get user level
  SELECT COALESCE(current_level, 0) INTO v_level
  FROM user_level_status WHERE user_id = p_user_id;
  v_level := COALESCE(v_level, 0);

  -- Derive capacity from activity
  SELECT CASE
    WHEN COALESCE(mk.calls_handled, 0) >= 20 AND COALESCE(mk.closing_rate, 0) >= 15 THEN 'high'
    WHEN COALESCE(mk.calls_handled, 0) >= 5 THEN 'medium'
    ELSE 'low'
  END INTO v_capacity
  FROM member_kpis mk WHERE mk.user_id = p_user_id;
  v_capacity := COALESCE(v_capacity, 'low');

  -- Clear old matches
  DELETE FROM trainer_matches WHERE user_id = p_user_id;

  FOR v_trainer IN
    SELECT * FROM trainers WHERE is_approved = true
  LOOP
    v_score := 0;
    v_reason := '';

    -- Level fit (0-40)
    IF v_level = ANY(v_trainer.levels_supported) THEN
      v_score := v_score + 40;
      v_reason := v_reason || 'Level-Match. ';
    ELSIF (v_level + 1) = ANY(v_trainer.levels_supported) OR (v_level - 1) = ANY(v_trainer.levels_supported) THEN
      v_score := v_score + 25;
      v_reason := v_reason || 'Nahe Level-Passung. ';
    END IF;

    -- Goal/specialty fit (0-25) — match primary focus to user level cluster
    IF v_level <= 3 AND 'nervous_system' = ANY(v_trainer.specialties) THEN
      v_score := v_score + 25;
      v_reason := v_reason || 'Spezialisiert auf Stabilisierung. ';
    ELSIF v_level BETWEEN 4 AND 6 AND ('strength' = ANY(v_trainer.specialties) OR 'clarity' = ANY(v_trainer.specialties)) THEN
      v_score := v_score + 25;
      v_reason := v_reason || 'Fokus auf Integration & Stärke. ';
    ELSIF v_level >= 7 AND ('wealth' = ANY(v_trainer.specialties) OR 'purpose' = ANY(v_trainer.specialties)) THEN
      v_score := v_score + 25;
      v_reason := v_reason || 'Expansion-Spezialist. ';
    ELSIF array_length(v_trainer.specialties, 1) > 0 THEN
      v_score := v_score + 10;
      v_reason := v_reason || 'Breites Spektrum. ';
    END IF;

    -- Capacity fit (0-20)
    IF v_capacity = 'low' AND v_trainer.coaching_style = 'stabilizing' THEN
      v_score := v_score + 20;
      v_reason := v_reason || 'Stabilisierender Stil passt. ';
    ELSIF v_capacity = 'high' AND v_trainer.coaching_style = 'challenging' THEN
      v_score := v_score + 20;
      v_reason := v_reason || 'Fordernder Stil passt. ';
    ELSIF v_trainer.coaching_style = 'structured' THEN
      v_score := v_score + 15;
      v_reason := v_reason || 'Strukturierter Ansatz. ';
    ELSE
      v_score := v_score + 10;
    END IF;

    -- Style fit (0-15) — featured bonus
    IF v_trainer.is_featured THEN
      v_score := v_score + 15;
      v_reason := v_reason || 'Empfohlen. ';
    ELSE
      v_score := v_score + 5;
    END IF;

    -- Only include if minimum score
    IF v_score >= 30 THEN
      INSERT INTO trainer_matches (user_id, trainer_id, score, reason)
      VALUES (p_user_id, v_trainer.id, v_score, RTRIM(v_reason));

      v_matches := v_matches || jsonb_build_object(
        'trainer_id', v_trainer.id,
        'name', v_trainer.name,
        'score', v_score,
        'reason', RTRIM(v_reason)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Sort and limit to top 3
  DELETE FROM trainer_matches
  WHERE user_id = p_user_id
    AND id NOT IN (
      SELECT id FROM trainer_matches
      WHERE user_id = p_user_id
      ORDER BY score DESC LIMIT 3
    );

  RETURN jsonb_build_object('matches', v_count, 'top', v_matches);
END;
$$;
