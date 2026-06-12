
-- Twilio Video Architecture — NOT Go-Live Critical

-- 1. Extend appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS video_room_sid text,
  ADD COLUMN IF NOT EXISTS video_room_name text,
  ADD COLUMN IF NOT EXISTS video_room_status text,
  ADD COLUMN IF NOT EXISTS video_join_url_internal text,
  ADD COLUMN IF NOT EXISTS video_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_duration_seconds int,
  ADD COLUMN IF NOT EXISTS recording_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_sid text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS transcript_status text,
  ADD COLUMN IF NOT EXISTS transcript_url text,
  ADD COLUMN IF NOT EXISTS video_provider_fallback boolean DEFAULT false;

-- 2. video_sessions
CREATE TABLE IF NOT EXISTS public.video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lead_id uuid,
  operator_unit_id uuid,
  room_sid text NOT NULL,
  room_name text NOT NULL,
  provider text NOT NULL DEFAULT 'twilio',
  status text NOT NULL DEFAULT 'created',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  participant_count int DEFAULT 0,
  recording_enabled boolean DEFAULT false,
  recording_status text,
  transcript_status text
);

CREATE INDEX idx_video_sessions_appointment ON public.video_sessions(appointment_id);
CREATE INDEX idx_video_sessions_unit ON public.video_sessions(operator_unit_id);
CREATE INDEX idx_video_sessions_status ON public.video_sessions(status);

ALTER TABLE public.video_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vs_own" ON public.video_sessions FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "vs_unit" ON public.video_sessions FOR SELECT TO authenticated
  USING (
    operator_unit_id IN (
      SELECT otm.unit_id FROM public.operator_team_members otm
      WHERE otm.member_id = auth.uid() AND otm.active = true
    )
  );

CREATE POLICY "vs_admin" ON public.video_sessions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner'))
  );

-- 3. video_participants
CREATE TABLE IF NOT EXISTS public.video_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_session_id uuid NOT NULL REFERENCES public.video_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid,
  participant_type text NOT NULL,
  display_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  duration_seconds int,
  device_info text,
  browser_info text
);

CREATE INDEX idx_vp_session ON public.video_participants(video_session_id);
ALTER TABLE public.video_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vp_read_via_session" ON public.video_participants FOR SELECT TO authenticated
  USING (video_session_id IN (SELECT id FROM public.video_sessions));

CREATE POLICY "vp_admin" ON public.video_participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));

-- 4. video_events
CREATE TABLE IF NOT EXISTS public.video_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_session_id uuid REFERENCES public.video_sessions(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ve_session ON public.video_events(video_session_id);
CREATE INDEX idx_ve_type ON public.video_events(event_type);
ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ve_read_via_session" ON public.video_events FOR SELECT TO authenticated
  USING (video_session_id IN (SELECT id FROM public.video_sessions));

CREATE POLICY "ve_admin" ON public.video_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));

-- 5. call_reviews
CREATE TABLE IF NOT EXISTS public.call_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_session_id uuid REFERENCES public.video_sessions(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  transcript_id text,
  score numeric(4,2),
  objections jsonb DEFAULT '[]',
  winning_phrases jsonb DEFAULT '[]',
  missed_opportunities jsonb DEFAULT '[]',
  recommended_training jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cr_session ON public.call_reviews(video_session_id);
ALTER TABLE public.call_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cr_read_via_session" ON public.call_reviews FOR SELECT TO authenticated
  USING (video_session_id IN (SELECT id FROM public.video_sessions));

CREATE POLICY "cr_admin" ON public.call_reviews FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));
