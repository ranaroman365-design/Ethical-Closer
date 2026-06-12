-- V2 Schema upgrades for Voice Closing Simulator

-- 1) Add estimated_duration to simulations
ALTER TABLE public.simulations ADD COLUMN IF NOT EXISTS estimated_duration integer;

-- 2) Add time_limit_seconds to simulation_steps
ALTER TABLE public.simulation_steps ADD COLUMN IF NOT EXISTS time_limit_seconds integer;

-- 3) Add completed flag to simulation_attempts
ALTER TABLE public.simulation_attempts ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

-- 4) Add improvement_text to simulation_responses
ALTER TABLE public.simulation_responses ADD COLUMN IF NOT EXISTS improvement_text text;

-- 5) Create simulation_user_progress table
CREATE TABLE IF NOT EXISTS public.simulation_user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level integer NOT NULL,
  avg_score real NOT NULL DEFAULT 0,
  best_score real NOT NULL DEFAULT 0,
  total_attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, level)
);

ALTER TABLE public.simulation_user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress"
  ON public.simulation_user_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own progress"
  ON public.simulation_user_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.simulation_user_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);