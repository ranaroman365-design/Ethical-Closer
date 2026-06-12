CREATE TABLE IF NOT EXISTS public.copilot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  call_id UUID NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','aborted')),
  ticks_count INTEGER NOT NULL DEFAULT 0,
  final_transcript TEXT NULL,
  outcome TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_user ON public.copilot_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_call ON public.copilot_sessions(call_id) WHERE call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.copilot_live_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tick_index INTEGER NOT NULL,
  phase TEXT NULL,
  buyer_state TEXT NULL,
  deal_risk TEXT NULL,
  detected_objection TEXT NULL,
  next_best_action TEXT NULL,
  exact_phrase TEXT NULL,
  alt_phrase TEXT NULL,
  reasoning TEXT NULL,
  risk_alert TEXT NULL,
  clarity_score INTEGER NULL CHECK (clarity_score IS NULL OR clarity_score BETWEEN 0 AND 100),
  confidence_score INTEGER NULL CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  control_score INTEGER NULL CHECK (control_score IS NULL OR control_score BETWEEN 0 AND 100),
  objection_score INTEGER NULL CHECK (objection_score IS NULL OR objection_score BETWEEN 0 AND 100),
  ethical_score INTEGER NULL CHECK (ethical_score IS NULL OR ethical_score BETWEEN 0 AND 100),
  latency_ms INTEGER NULL,
  transcript_window TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_live_session ON public.copilot_live_events(session_id, tick_index);
CREATE INDEX IF NOT EXISTS idx_copilot_live_user ON public.copilot_live_events(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_copilot_sessions_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_copilot_sessions_touch ON public.copilot_sessions;
CREATE TRIGGER trg_copilot_sessions_touch
BEFORE UPDATE ON public.copilot_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_copilot_sessions_touch();

ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_live_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "copilot_sessions_owner_select" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_owner_select" ON public.copilot_sessions
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "copilot_sessions_owner_insert" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_owner_insert" ON public.copilot_sessions
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "copilot_sessions_owner_update" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_owner_update" ON public.copilot_sessions
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "copilot_sessions_admin_select" ON public.copilot_sessions;
CREATE POLICY "copilot_sessions_admin_select" ON public.copilot_sessions
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "copilot_live_owner_select" ON public.copilot_live_events;
CREATE POLICY "copilot_live_owner_select" ON public.copilot_live_events
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "copilot_live_owner_insert" ON public.copilot_live_events;
CREATE POLICY "copilot_live_owner_insert" ON public.copilot_live_events
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "copilot_live_admin_select" ON public.copilot_live_events;
CREATE POLICY "copilot_live_admin_select" ON public.copilot_live_events
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));