
-- Copilot sessions (one per live listening session, optionally linked to a call)
CREATE TABLE public.copilot_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  outcome TEXT DEFAULT 'pending',
  outcome_tagged_at TIMESTAMPTZ,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  anonymized BOOLEAN NOT NULL DEFAULT false,
  total_state_shifts INTEGER DEFAULT 0,
  dominant_state TEXT,
  final_momentum TEXT,
  final_commitment TEXT,
  final_risk TEXT,
  summary_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- State timeline events within a session
CREATE TABLE public.copilot_state_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  offset_seconds INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  momentum TEXT,
  commitment_quality TEXT,
  risk_level TEXT,
  likely_issue TEXT,
  matched_signals TEXT[],
  state_shift_alert TEXT,
  hold_silence BOOLEAN DEFAULT false,
  transcript_snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Signal occurrence log
CREATE TABLE public.copilot_signal_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  signal_cluster TEXT NOT NULL,
  signal_pattern TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  first_seen_offset INTEGER,
  last_seen_offset INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extracted pattern insights (cross-call analysis results)
CREATE TABLE public.copilot_pattern_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insight_type TEXT NOT NULL DEFAULT 'correlation',
  pattern_description TEXT NOT NULL,
  correlation_outcome TEXT,
  sample_size INTEGER DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0,
  state_sequence TEXT[],
  signal_indicators TEXT[],
  recommendation TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_copilot_sessions_user ON public.copilot_sessions(user_id);
CREATE INDEX idx_copilot_sessions_call ON public.copilot_sessions(call_id);
CREATE INDEX idx_copilot_sessions_outcome ON public.copilot_sessions(outcome);
CREATE INDEX idx_copilot_state_events_session ON public.copilot_state_events(session_id);
CREATE INDEX idx_copilot_signal_log_session ON public.copilot_signal_log(session_id);
CREATE INDEX idx_copilot_signal_log_cluster ON public.copilot_signal_log(signal_cluster);

-- RLS
ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_signal_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_pattern_insights ENABLE ROW LEVEL SECURITY;

-- Users can manage their own sessions
CREATE POLICY "Users manage own copilot sessions" ON public.copilot_sessions
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Users can manage state events in their own sessions
CREATE POLICY "Users manage own state events" ON public.copilot_state_events
  FOR ALL TO authenticated USING (session_id IN (SELECT id FROM public.copilot_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM public.copilot_sessions WHERE user_id = auth.uid()));

-- Users can manage signal logs in their own sessions
CREATE POLICY "Users manage own signal logs" ON public.copilot_signal_log
  FOR ALL TO authenticated USING (session_id IN (SELECT id FROM public.copilot_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM public.copilot_sessions WHERE user_id = auth.uid()));

-- Admins can read all sessions/events/signals
CREATE POLICY "Admins read all copilot sessions" ON public.copilot_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Admins read all state events" ON public.copilot_state_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.copilot_sessions cs WHERE cs.id = session_id AND (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)))
  );

CREATE POLICY "Admins read all signal logs" ON public.copilot_signal_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.copilot_sessions cs WHERE cs.id = session_id AND (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)))
  );

-- Pattern insights readable by admins/owners only
CREATE POLICY "Admins read pattern insights" ON public.copilot_pattern_insights
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "System inserts pattern insights" ON public.copilot_pattern_insights
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role));

-- Enable realtime for state events (live dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE public.copilot_state_events;
