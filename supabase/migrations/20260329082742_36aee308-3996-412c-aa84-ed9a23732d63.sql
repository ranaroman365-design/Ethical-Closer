
-- 1) Add mode to simulation_attempts
ALTER TABLE public.simulation_attempts ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'step';

-- 2) Add score_conversation_control to simulation_responses
ALTER TABLE public.simulation_responses ADD COLUMN IF NOT EXISTS score_conversation_control real;

-- 3) Add realtime_simulator_enabled to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS realtime_simulator_enabled boolean NOT NULL DEFAULT false;

-- 4) Create audio_sessions table
CREATE TABLE IF NOT EXISTS public.audio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  simulation_id uuid REFERENCES public.simulations(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'step',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  final_transcript text,
  final_score real,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sessions" ON public.audio_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions" ON public.audio_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON public.audio_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) Create audio_session_turns table
CREATE TABLE IF NOT EXISTS public.audio_session_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audio_sessions(id) ON DELETE CASCADE,
  speaker text NOT NULL DEFAULT 'user',
  transcript text,
  audio_url text,
  turn_order integer NOT NULL DEFAULT 0,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_session_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own session turns" ON public.audio_session_turns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audio_sessions WHERE id = session_id AND user_id = auth.uid()));
CREATE POLICY "Users insert own session turns" ON public.audio_session_turns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audio_sessions WHERE id = session_id AND user_id = auth.uid()));
