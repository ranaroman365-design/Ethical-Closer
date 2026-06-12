
-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2: Smart Attendance + AI Setter — Real Activation Foundation
-- All additive. Defaults preserve existing behavior (silent until enabled).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Lead compliance fields ----------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppression_reason text,
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_dnc ON public.leads(do_not_contact) WHERE do_not_contact = true;

-- 2. Attendance jobs hardening -------------------------------------------------
ALTER TABLE public.attendance_jobs
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS funnel_key text;

CREATE INDEX IF NOT EXISTS idx_attendance_jobs_retry ON public.attendance_jobs(next_retry_at) WHERE status = 'failed';

-- 3. Attendance settings — admin controls --------------------------------------
ALTER TABLE public.attendance_settings
  ADD COLUMN IF NOT EXISTS emergency_shutdown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS l6_can_edit_touchpoints boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_test_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_test_send_status text;

-- 4. AI Setter settings — admin controls ---------------------------------------
ALTER TABLE public.ai_setter_settings
  ADD COLUMN IF NOT EXISTS emergency_shutdown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_real_voice_calls boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_real_followup_messages boolean NOT NULL DEFAULT false;

-- 5. AI Setter call logs — test call flag --------------------------------------
ALTER TABLE public.ai_setter_call_logs
  ADD COLUMN IF NOT EXISTS test_call boolean NOT NULL DEFAULT false;

-- 6. Operator ↔ Funnel assignments (must exist BEFORE policies that reference it)
CREATE TABLE IF NOT EXISTS public.operator_funnel_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funnel_key text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operator_id, funnel_key)
);
ALTER TABLE public.operator_funnel_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ofa_admin_all ON public.operator_funnel_assignments;
CREATE POLICY ofa_admin_all ON public.operator_funnel_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));
DROP POLICY IF EXISTS ofa_self_read ON public.operator_funnel_assignments;
CREATE POLICY ofa_self_read ON public.operator_funnel_assignments
  FOR SELECT TO authenticated USING (operator_id = auth.uid());

-- 7. Touchpoint Config (L6-editable per funnel) --------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_touchpoint_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','funnel','operator')),
  funnel_key text,
  operator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL CHECK (trigger IN (
    'on_booking','t_minus_24h','t_minus_3h','t_minus_30m',
    't_plus_5m_no_show','t_plus_15m_no_show',
    't_plus_24h_recovery','t_plus_72h_recovery'
  )),
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','email','voice')),
  active boolean NOT NULL DEFAULT true,
  delay_minutes integer,
  template_key text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atc_scope_keys CHECK (
    (scope='global'   AND funnel_key IS NULL AND operator_id IS NULL) OR
    (scope='funnel'   AND funnel_key IS NOT NULL AND operator_id IS NULL) OR
    (scope='operator' AND operator_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS atc_unique
  ON public.attendance_touchpoint_config(scope, COALESCE(funnel_key,''), COALESCE(operator_id,'00000000-0000-0000-0000-000000000000'::uuid), trigger, channel);

ALTER TABLE public.attendance_touchpoint_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atc_admin_all ON public.attendance_touchpoint_config;
CREATE POLICY atc_admin_all ON public.attendance_touchpoint_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));

DROP POLICY IF EXISTS atc_global_read ON public.attendance_touchpoint_config;
CREATE POLICY atc_global_read ON public.attendance_touchpoint_config
  FOR SELECT TO authenticated USING (scope = 'global');

DROP POLICY IF EXISTS atc_l6_own_funnel ON public.attendance_touchpoint_config;
CREATE POLICY atc_l6_own_funnel ON public.attendance_touchpoint_config
  FOR ALL TO authenticated
  USING (
    scope IN ('funnel','operator')
    AND (operator_id = auth.uid() OR funnel_key IN (SELECT funnel_key FROM public.operator_funnel_assignments WHERE operator_id = auth.uid()))
    AND is_attendance_operator(auth.uid())
  )
  WITH CHECK (
    scope IN ('funnel','operator')
    AND (operator_id = auth.uid() OR funnel_key IN (SELECT funnel_key FROM public.operator_funnel_assignments WHERE operator_id = auth.uid()))
    AND is_attendance_operator(auth.uid())
  );

-- 8. Touchpoint Admin Guardrails ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.touchpoint_admin_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL UNIQUE CHECK (trigger IN (
    'on_booking','t_minus_24h','t_minus_3h','t_minus_30m',
    't_plus_5m_no_show','t_plus_15m_no_show',
    't_plus_24h_recovery','t_plus_72h_recovery'
  )),
  min_offset_minutes integer NOT NULL DEFAULT 0,
  max_offset_minutes integer NOT NULL DEFAULT 4320,
  l6_editable boolean NOT NULL DEFAULT true,
  channels_allowed text[] NOT NULL DEFAULT ARRAY['sms','whatsapp']::text[],
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.touchpoint_admin_guardrails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tag_admin_all ON public.touchpoint_admin_guardrails;
CREATE POLICY tag_admin_all ON public.touchpoint_admin_guardrails
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));
DROP POLICY IF EXISTS tag_read_all ON public.touchpoint_admin_guardrails;
CREATE POLICY tag_read_all ON public.touchpoint_admin_guardrails
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.touchpoint_admin_guardrails(trigger, min_offset_minutes, max_offset_minutes) VALUES
  ('on_booking', 0, 60),
  ('t_minus_24h', -1500, -1380),
  ('t_minus_3h', -210, -150),
  ('t_minus_30m', -45, -15),
  ('t_plus_5m_no_show', 5, 15),
  ('t_plus_15m_no_show', 15, 30),
  ('t_plus_24h_recovery', 1380, 1500),
  ('t_plus_72h_recovery', 4140, 4380)
ON CONFLICT (trigger) DO NOTHING;

-- 9. Message Library funnel overrides ------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_library_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('funnel','operator')),
  funnel_key text,
  operator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_key text NOT NULL DEFAULT 'A',
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','email','voice','in_app')),
  subject_de text, subject_en text,
  body_de text NOT NULL, body_en text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mlo_scope_keys CHECK (
    (scope='funnel'   AND funnel_key IS NOT NULL AND operator_id IS NULL) OR
    (scope='operator' AND operator_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS mlo_unique
  ON public.message_library_overrides(template_key, scope, COALESCE(funnel_key,''), COALESCE(operator_id,'00000000-0000-0000-0000-000000000000'::uuid), variant_key);

ALTER TABLE public.message_library_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mlo_admin_all ON public.message_library_overrides;
CREATE POLICY mlo_admin_all ON public.message_library_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));
DROP POLICY IF EXISTS mlo_l6_own ON public.message_library_overrides;
CREATE POLICY mlo_l6_own ON public.message_library_overrides
  FOR ALL TO authenticated
  USING (
    (scope='operator' AND operator_id = auth.uid())
    OR (scope='funnel' AND funnel_key IN (SELECT funnel_key FROM public.operator_funnel_assignments WHERE operator_id = auth.uid()))
  )
  WITH CHECK (
    (scope='operator' AND operator_id = auth.uid())
    OR (scope='funnel' AND funnel_key IN (SELECT funnel_key FROM public.operator_funnel_assignments WHERE operator_id = auth.uid()))
  );

-- 10. Inbound message intents --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_message_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  twilio_sid text,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','voice')),
  raw_body text,
  intent text NOT NULL CHECK (intent IN ('confirmed','reschedule','cancel','stop','unknown')),
  acted_on boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lmi_lead ON public.lead_message_intents(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmi_intent_unknown ON public.lead_message_intents(intent) WHERE intent = 'unknown';
ALTER TABLE public.lead_message_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lmi_admin_all ON public.lead_message_intents;
CREATE POLICY lmi_admin_all ON public.lead_message_intents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));
DROP POLICY IF EXISTS lmi_operator_read ON public.lead_message_intents;
CREATE POLICY lmi_operator_read ON public.lead_message_intents
  FOR SELECT TO authenticated
  USING (
    is_attendance_operator(auth.uid())
    AND lead_id IN (SELECT id FROM public.leads WHERE setter_id = auth.uid() OR closer_id = auth.uid() OR owner_id = auth.uid())
  );

-- 11. RPCs --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.suppress_lead(_lead_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET do_not_contact = true,
      suppression_reason = _reason,
      suppressed_at = now(),
      updated_at = now()
  WHERE id = _lead_id;

  UPDATE public.attendance_jobs
  SET status = 'cancelled', last_error = 'lead suppressed: ' || COALESCE(_reason,'manual'), updated_at = now()
  WHERE status = 'pending'
    AND appointment_id IN (SELECT id FROM public.appointments WHERE lead_id = _lead_id);

  UPDATE public.ai_setter_call_queue
  SET status = 'cancelled', updated_at = now()
  WHERE status = 'pending' AND lead_id = _lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_eligible_to_send(_lead_id uuid, _channel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l record;
BEGIN
  SELECT do_not_contact, consent_phone, phone INTO l FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF l.do_not_contact THEN RETURN false; END IF;
  IF l.phone IS NULL OR l.phone = '' THEN RETURN false; END IF;
  IF _channel IN ('sms','whatsapp','voice') AND NOT l.consent_phone THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_touchpoint_template(
  _trigger text, _channel text, _funnel_key text, _operator_id uuid
)
RETURNS TABLE(scope text, body text, subject text, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _funnel_key IS NOT NULL THEN
    RETURN QUERY
    SELECT 'funnel'::text, mlo.body_de, mlo.subject_de, 'message_library_overrides'::text
    FROM public.message_library_overrides mlo
    WHERE mlo.scope='funnel' AND mlo.funnel_key=_funnel_key AND mlo.channel=_channel
      AND mlo.active=true AND mlo.template_key LIKE 'touchpoint:' || _trigger || '%'
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF _operator_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 'operator'::text, mlo.body_de, mlo.subject_de, 'message_library_overrides'::text
    FROM public.message_library_overrides mlo
    WHERE mlo.scope='operator' AND mlo.operator_id=_operator_id AND mlo.channel=_channel
      AND mlo.active=true AND mlo.template_key LIKE 'touchpoint:' || _trigger || '%'
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  RETURN QUERY
  SELECT 'global'::text, ml.body_de, ml.subject_de, 'message_library'::text
  FROM public.message_library ml
  WHERE ml.scope='global' AND ml.channel=_channel AND ml.active=true
    AND ml.template_key LIKE 'touchpoint:' || _trigger || '%'
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'legacy'::text, at.body, at.subject, 'attendance_templates'::text
  FROM public.attendance_templates at
  WHERE at.trigger=_trigger AND at.channel=_channel AND at.scope='global' AND at.enabled=true
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_inbound_intent(
  _lead_id uuid, _appointment_id uuid, _twilio_sid text,
  _channel text, _raw_body text, _intent text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.lead_message_intents(lead_id, appointment_id, twilio_sid, channel, raw_body, intent)
  VALUES (_lead_id, _appointment_id, _twilio_sid, _channel, _raw_body, _intent)
  RETURNING id INTO _id;

  IF _intent = 'stop' AND _lead_id IS NOT NULL THEN
    PERFORM public.suppress_lead(_lead_id, 'inbound_stop');
  ELSIF _intent = 'cancel' AND _appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET appointment_status = 'cancelled', updated_at = now()
    WHERE id = _appointment_id AND appointment_status IN ('booked','confirmed','pending_payment');
  ELSIF _intent = 'confirmed' AND _appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET appointment_status = 'confirmed', updated_at = now()
    WHERE id = _appointment_id AND appointment_status IN ('booked','pending_payment');
  END IF;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.l6_attendance_dashboard(_operator_id uuid, _funnel_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  scoped_appts uuid[];
BEGIN
  SELECT ARRAY_AGG(a.id) INTO scoped_appts
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.lead_id
  WHERE (a.setter_id = _operator_id OR l.setter_id = _operator_id OR l.closer_id = _operator_id OR l.owner_id = _operator_id)
    AND a.starts_at > now() - interval '30 days';

  scoped_appts := COALESCE(scoped_appts, ARRAY[]::uuid[]);

  result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'booked', (SELECT count(*) FROM public.appointments WHERE id = ANY(scoped_appts) AND appointment_status IN ('booked','confirmed')),
      'reminders_sent', (SELECT count(*) FROM public.attendance_jobs WHERE appointment_id = ANY(scoped_appts) AND status = 'sent'),
      'failed_messages', (SELECT count(*) FROM public.attendance_jobs WHERE appointment_id = ANY(scoped_appts) AND status = 'failed'),
      'unknown_replies', (SELECT count(*) FROM public.lead_message_intents WHERE appointment_id = ANY(scoped_appts) AND intent = 'unknown'),
      'reschedule_requests', (SELECT count(*) FROM public.lead_message_intents WHERE appointment_id = ANY(scoped_appts) AND intent = 'reschedule'),
      'confirmed_replies', (SELECT count(*) FROM public.lead_message_intents WHERE appointment_id = ANY(scoped_appts) AND intent = 'confirmed')
    ),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'status',a.appointment_status,'lead_name',l.name) ORDER BY a.starts_at ASC)
      FROM public.appointments a JOIN public.leads l ON l.id=a.lead_id
      WHERE a.id = ANY(scoped_appts) AND a.starts_at > now() AND a.appointment_status IN ('booked','confirmed','pending_payment')
      LIMIT 20
    ), '[]'::jsonb),
    'recent_replies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',i.id,'intent',i.intent,'body',LEFT(i.raw_body,140),'created_at',i.created_at) ORDER BY i.created_at DESC)
      FROM public.lead_message_intents i
      WHERE i.appointment_id = ANY(scoped_appts)
      LIMIT 20
    ), '[]'::jsonb),
    'failed_jobs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',j.id,'trigger',j.trigger,'channel',j.channel,'last_error',j.last_error,'attempts',j.attempts) ORDER BY j.updated_at DESC)
      FROM public.attendance_jobs j
      WHERE j.appointment_id = ANY(scoped_appts) AND j.status = 'failed'
      LIMIT 20
    ), '[]'::jsonb)
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.l6_ai_setter_dashboard(_operator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'in_queue', (SELECT count(*) FROM public.ai_setter_call_queue WHERE operator_id = _operator_id AND status = 'pending'),
      'followups_sent', (SELECT count(*) FROM public.twilio_message_logs WHERE operator_id = _operator_id AND source='ai_setter' AND status IN ('sent','queued','delivered')),
      'failed_followups', (SELECT count(*) FROM public.twilio_message_logs WHERE operator_id = _operator_id AND source='ai_setter' AND status='failed'),
      'human_handoffs', (SELECT count(*) FROM public.ai_setter_call_logs WHERE operator_id = _operator_id AND outcome='human_handoff')
    ),
    'queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',q.id,'lead_id',q.lead_id,'segment',q.segment,'attempts',q.attempts,'scheduled_for',q.scheduled_for) ORDER BY q.scheduled_for ASC)
      FROM public.ai_setter_call_queue q
      WHERE q.operator_id = _operator_id AND q.status='pending'
      LIMIT 30
    ), '[]'::jsonb),
    'recent_events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'created_at',e.created_at,'payload',e.payload) ORDER BY e.created_at DESC)
      FROM public.ai_setter_events e
      WHERE (e.payload->>'operator_id')::uuid = _operator_id OR e.payload->>'operator_id' IS NULL
      LIMIT 20
    ), '[]'::jsonb)
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suppress_lead(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_eligible_to_send(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_touchpoint_template(text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inbound_intent(uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.l6_attendance_dashboard(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.l6_ai_setter_dashboard(uuid) TO authenticated;
