-- ═══════════════════════════════════════════════════════════════════════
-- Layer 27 + 28 — Smart Attendance + AI Setter Voice (additive only)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────── Smart Attendance ──────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','operator')),
  operator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  smart_attendance_enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  default_cascade text[] NOT NULL DEFAULT ARRAY['whatsapp','sms']::text[],
  allowed_hours_start int NOT NULL DEFAULT 9 CHECK (allowed_hours_start BETWEEN 0 AND 23),
  allowed_hours_end int NOT NULL DEFAULT 19 CHECK (allowed_hours_end BETWEEN 1 AND 24),
  allowed_hours_tz text NOT NULL DEFAULT 'Europe/Berlin',
  voice_confirmation_enabled boolean NOT NULL DEFAULT false,
  twilio_from_number text,
  twilio_whatsapp_from text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, operator_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_settings_global_singleton
  ON public.attendance_settings ((scope)) WHERE scope = 'global';

CREATE TABLE IF NOT EXISTS public.attendance_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','operator')),
  operator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL CHECK (trigger IN (
    'on_booking','t_minus_24h','t_minus_3h','t_minus_30m',
    't_plus_5m_no_show','t_plus_15m_no_show','t_plus_24h_recovery','t_plus_72h_recovery'
  )),
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','voice','email')),
  language text NOT NULL DEFAULT 'de',
  subject text,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_templates_lookup
  ON public.attendance_templates (trigger, channel, language, scope, operator_id);

CREATE TABLE IF NOT EXISTS public.attendance_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger text NOT NULL,
  channel text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','sent_stub','skipped','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_jobs_due ON public.attendance_jobs (status, scheduled_for);
CREATE INDEX IF NOT EXISTS attendance_jobs_appt ON public.attendance_jobs (appointment_id);

CREATE TABLE IF NOT EXISTS public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_events_appt ON public.attendance_events (appointment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.appointment_attendance_status (
  appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','confirmation_pending','confirmed','at_risk',
                      'reschedule_requested','rescheduled','no_show','recovered',
                      'showed','closed_won','closed_lost')),
  risk_score int NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  last_signal text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────── AI Setter Voice ───────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_setter_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','operator')),
  operator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_setter_enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  max_attempts int NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  call_window_start_hour int NOT NULL DEFAULT 9,
  call_window_end_hour int NOT NULL DEFAULT 19,
  call_window_tz text NOT NULL DEFAULT 'Europe/Berlin',
  voice_provider text NOT NULL DEFAULT 'stub'
    CHECK (voice_provider IN ('stub','twilio_voice','vapi','retell','elevenlabs_twilio')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, operator_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_setter_settings_global_singleton
  ON public.ai_setter_settings ((scope)) WHERE scope = 'global';

CREATE TABLE IF NOT EXISTS public.ai_setter_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','operator')),
  operator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  block text NOT NULL CHECK (block IN (
    'opener','qualification','value_bridge','booking_push','objections','voicemail','follow_up'
  )),
  language text NOT NULL DEFAULT 'de',
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_setter_scripts_lookup
  ON public.ai_setter_scripts (block, language, scope, operator_id);

CREATE TABLE IF NOT EXISTS public.ai_setter_call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  segment text NOT NULL CHECK (segment IN (
    'unbooked_qualified','booked_unconfirmed','booked_at_risk',
    'no_show_recovery','reschedule_requested'
  )),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','done','skipped','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_setter_queue_due ON public.ai_setter_call_queue (status, scheduled_for);

CREATE TABLE IF NOT EXISTS public.ai_setter_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.ai_setter_call_queue(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN (
    'booked','booking_link_sent','reschedule_link_sent','not_interested',
    'call_back_later','no_answer','voicemail_left','human_handoff','failed','sent_stub'
  )),
  duration_seconds int,
  twilio_call_sid text,
  transcript_url text,
  notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_setter_logs_lead ON public.ai_setter_call_logs (lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_setter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────── Twilio shared log ─────────────────────────

CREATE TABLE IF NOT EXISTS public.twilio_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('attendance','ai_setter','manual')),
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','voice')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  to_number text,
  from_number text,
  twilio_sid text,
  status text NOT NULL DEFAULT 'queued',
  body text,
  error_code text,
  error_message text,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS twilio_logs_recent ON public.twilio_message_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS twilio_logs_sid ON public.twilio_message_logs (twilio_sid);

-- ─────────────────────────── updated_at triggers ───────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_attendance_ai') THEN
    CREATE FUNCTION public.set_updated_at_attendance_ai()
    RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $f$;
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_trigger WHERE tgname = 'tg_attendance_settings_updated';
  IF NOT FOUND THEN
    CREATE TRIGGER tg_attendance_settings_updated BEFORE UPDATE ON public.attendance_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
    CREATE TRIGGER tg_attendance_templates_updated BEFORE UPDATE ON public.attendance_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
    CREATE TRIGGER tg_attendance_jobs_updated BEFORE UPDATE ON public.attendance_jobs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
    CREATE TRIGGER tg_appointment_attendance_status_updated BEFORE UPDATE ON public.appointment_attendance_status
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
    CREATE TRIGGER tg_ai_setter_settings_updated BEFORE UPDATE ON public.ai_setter_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
    CREATE TRIGGER tg_ai_setter_scripts_updated BEFORE UPDATE ON public.ai_setter_scripts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
    CREATE TRIGGER tg_ai_setter_call_queue_updated BEFORE UPDATE ON public.ai_setter_call_queue
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_attendance_ai();
  END IF;
END $$;

-- ─────────────────────────── On-appointment-created hook ───────────────
-- Strictly additive: only creates a status mirror row if the global flag is on.

CREATE OR REPLACE FUNCTION public.attendance_on_appointment_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT smart_attendance_enabled INTO v_enabled
  FROM public.attendance_settings WHERE scope = 'global' LIMIT 1;
  IF COALESCE(v_enabled, false) THEN
    INSERT INTO public.appointment_attendance_status (appointment_id, operator_id, status)
    VALUES (NEW.id, NEW.setter_id, 'booked')
    ON CONFLICT (appointment_id) DO NOTHING;
    INSERT INTO public.attendance_events (appointment_id, operator_id, event_type, to_status, payload)
    VALUES (NEW.id, NEW.setter_id, 'appointment_created', 'booked', jsonb_build_object('source','trigger'));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never break booking
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_attendance_on_appointment_created ON public.appointments;
CREATE TRIGGER tg_attendance_on_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.attendance_on_appointment_created();

-- ─────────────────────────── RLS ───────────────────────────────────────

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_attendance_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_setter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_setter_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_setter_call_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_setter_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_setter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twilio_message_logs ENABLE ROW LEVEL SECURITY;

-- Helper: is user L6+ (admin/owner OR profile.current_phase >= 6)
CREATE OR REPLACE FUNCTION public.is_attendance_operator(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid AND COALESCE(p.current_phase, 0) >= 6
  ) OR public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'owner'::app_role)
    OR public.has_role(_uid, 'ops_admin'::app_role);
$$;

-- Pattern: admins full; operator scoped to own rows; everyone can read global settings.

-- attendance_settings
CREATE POLICY "att_settings_admin_all" ON public.attendance_settings FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role));
CREATE POLICY "att_settings_operator_own" ON public.attendance_settings FOR ALL
  TO authenticated USING (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()))
  WITH CHECK (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));
CREATE POLICY "att_settings_global_read" ON public.attendance_settings FOR SELECT
  TO authenticated USING (scope='global');

-- attendance_templates
CREATE POLICY "att_tpl_admin_all" ON public.attendance_templates FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role));
CREATE POLICY "att_tpl_operator_own" ON public.attendance_templates FOR ALL
  TO authenticated USING (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()))
  WITH CHECK (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));
CREATE POLICY "att_tpl_global_read" ON public.attendance_templates FOR SELECT
  TO authenticated USING (scope='global');

-- attendance_jobs
CREATE POLICY "att_jobs_admin_all" ON public.attendance_jobs FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role));
CREATE POLICY "att_jobs_operator_read" ON public.attendance_jobs FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- attendance_events
CREATE POLICY "att_events_admin_all" ON public.attendance_events FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "att_events_operator_read" ON public.attendance_events FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- appointment_attendance_status
CREATE POLICY "att_status_admin_all" ON public.appointment_attendance_status FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "att_status_operator_read" ON public.appointment_attendance_status FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- ai_setter_settings
CREATE POLICY "ais_settings_admin_all" ON public.ai_setter_settings FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role));
CREATE POLICY "ais_settings_operator_own" ON public.ai_setter_settings FOR ALL
  TO authenticated USING (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()))
  WITH CHECK (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));
CREATE POLICY "ais_settings_global_read" ON public.ai_setter_settings FOR SELECT
  TO authenticated USING (scope='global');

-- ai_setter_scripts
CREATE POLICY "ais_scripts_admin_all" ON public.ai_setter_scripts FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role));
CREATE POLICY "ais_scripts_operator_own" ON public.ai_setter_scripts FOR ALL
  TO authenticated USING (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()))
  WITH CHECK (scope='operator' AND operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));
CREATE POLICY "ais_scripts_global_read" ON public.ai_setter_scripts FOR SELECT
  TO authenticated USING (scope='global');

-- ai_setter_call_queue
CREATE POLICY "ais_queue_admin_all" ON public.ai_setter_call_queue FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role));
CREATE POLICY "ais_queue_operator_read" ON public.ai_setter_call_queue FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- ai_setter_call_logs
CREATE POLICY "ais_logs_admin_all" ON public.ai_setter_call_logs FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "ais_logs_operator_read" ON public.ai_setter_call_logs FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- ai_setter_events
CREATE POLICY "ais_events_admin_all" ON public.ai_setter_events FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "ais_events_operator_read" ON public.ai_setter_events FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- twilio_message_logs (admins only; operator can read own)
CREATE POLICY "twilio_logs_admin_all" ON public.twilio_message_logs FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "twilio_logs_operator_read" ON public.twilio_message_logs FOR SELECT
  TO authenticated USING (operator_id = auth.uid() AND public.is_attendance_operator(auth.uid()));

-- ─────────────────────────── Seed global rows (OFF) ────────────────────
INSERT INTO public.attendance_settings (scope, smart_attendance_enabled, test_mode)
VALUES ('global', false, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_setter_settings (scope, ai_setter_enabled, test_mode)
VALUES ('global', false, true)
ON CONFLICT DO NOTHING;