-- Voice Closing Simulator tables

CREATE TABLE public.simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level integer NOT NULL CHECK (level BETWEEN 1 AND 6),
  title text NOT NULL,
  scenario_text text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  objective text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.simulation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1,
  ai_prompt text NOT NULL,
  objection_type text,
  expected_skill text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.simulation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  simulation_id uuid NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  total_score real,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.simulation_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.simulation_attempts(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.simulation_steps(id) ON DELETE CASCADE,
  audio_url text NOT NULL,
  transcript text,
  score_clarity real,
  score_structure real,
  score_emotional_control real,
  score_objection_handling real,
  score_closing_direction real,
  feedback_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_responses ENABLE ROW LEVEL SECURITY;

-- Simulations: everyone can read active ones
CREATE POLICY "Anyone can read active simulations"
ON public.simulations FOR SELECT TO authenticated
USING (is_active = true);

-- Admins can manage simulations
CREATE POLICY "Admins manage simulations"
ON public.simulations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Steps: everyone can read
CREATE POLICY "Anyone can read simulation steps"
ON public.simulation_steps FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.simulations s WHERE s.id = simulation_id AND s.is_active = true));

-- Admins manage steps
CREATE POLICY "Admins manage simulation steps"
ON public.simulation_steps FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Attempts: users own
CREATE POLICY "Users manage own attempts"
ON public.simulation_attempts FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins read all attempts
CREATE POLICY "Admins read all attempts"
ON public.simulation_attempts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Responses: users own via attempt
CREATE POLICY "Users manage own responses"
ON public.simulation_responses FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.simulation_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.simulation_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()));

-- Admins read all responses
CREATE POLICY "Admins read all responses"
ON public.simulation_responses FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_simulation_steps_sim ON public.simulation_steps(simulation_id, step_order);
CREATE INDEX idx_simulation_attempts_user ON public.simulation_attempts(user_id, simulation_id);
CREATE INDEX idx_simulation_responses_attempt ON public.simulation_responses(attempt_id);